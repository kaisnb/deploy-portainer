#! /usr/bin/env node

const fs = require("fs");
const tar = require("tar");
const chalk = require("chalk");
const axios = require("axios");
const { read } = require("./utils.js");

const info = (...arguments) => console.log(chalk.white(...arguments));
const success = (...arguments) => console.log(chalk.green(...arguments));
const warn = (...arguments) => console.log(chalk.yellow(...arguments));
const error = (...arguments) => console.log(chalk.bgRed(...arguments));

(async function () {
  //Parsing cli arguments. Need to skip the first two.
  const args = {};
  for (let i = 2; i < process.argv.length; i++) {
    const splitted = process.argv[i].split("=");
    args[splitted[0]] = splitted[1];
  }

  // Reading config file at the given path
  info("Reading config file at " + args.config);
  const configFile = fs.readFileSync(args.config);
  const options = JSON.parse(configFile);

  // Creating API Client
  const path = options.portainerBaseUrl || "api/";
  const port = options.portainerPort || 9000;
  const axiosConf = {
    baseURL: `http://${options.portainerHost}:${port}/${path}`,
  };
  if (options.proxy) {
    axiosConf.proxy = options.proxy;
  }
  const httpClient = axios.create(axiosConf);

  // Login an retrieve jwt token
  const loginResp = await httpClient.post("auth", {
    Username: await read({ prompt: "Enter username: " }),
    Password: await read({
      prompt: "Enter password: ",
      silent: true,
      replace: "*",
    }),
  });
  success("Successfully logged into portainer.");

  // Set jwt token as default authorization header
  httpClient.defaults.headers.common["Authorization"] = loginResp.data.jwt;

  // Determine docker endpoint to use
  const endpointName = options.endpointName || 'local';
  const listEndpointsResp = await httpClient.get("endpoints");
  const endpoint = listEndpointsResp.data.find(
    (e) => e.Name === endpointName
  );
  let endpointId = null;
  if (endpoint) {
    endpointId = endpoint.Id;
    success(
      `Successfully found endpoint named ${endpointName} with ID ${endpointId}.`
    );
  } else {
    throw new Error(`Endpoint ${endpointName} not found.`);
  }

  // Gibt an ob altes Image mit gleichem Namen einfach ueberschrieben werden soll.
  // Im Entwicklungsbetrieb lassen wir dies zu aber im Produktiv Modus verhindern wird
  // es damit nicht versehentlich ein Image mit dem gleichen Version-Tag erzeugt wird.
  let imageTag = null;
  let pJsonName = null;
  const pJsonPath = "package.json";
  if (fs.existsSync(pJsonPath)) {
    const pjson = JSON.parse(fs.readFileSync(pJsonPath));
    pJsonName = pjson.name;
    const imageName = options.imageName || pJsonName;
    imageTag = imageName + ":" + pjson.version;
  } else {
    imageTag = options.imageName + ":" + options.imageVersion;
  }
  if (options.overrideOldImage) {
    // Lookup if images with same name already exists
    info(`Checking if images with tag ${imageTag} already exists.`);
    const listImagesUrl = `endpoints/${endpointId}/docker/images/json`;
    const listImagesResp = await httpClient.get(listImagesUrl);
    const oldImage = listImagesResp.data.find(
      (img) => img.RepoTags && img.RepoTags.some((tag) => tag === imageTag)
    );

    // If image with name exists, delete the old one
    if (oldImage) {
      warn(`Found image with tag ${imageTag}.`);

      // First check if there are containers using this image
      const containerListResp = await httpClient.get(
        `endpoints/${endpointId}/docker/containers/json?all=1`
      );
      const oldContainers = containerListResp.data.filter(
        (container) => container.Image === imageTag
      );
      warn(`Found ${oldContainers.length} containers using image ${imageTag}.`);

      // Delete containers using this image
      for (let oldContainer of oldContainers) {
        const deleteContainerUrl = `endpoints/${endpointId}/docker/containers/${oldContainer.Id}?force=true&v=1`;
        await httpClient.delete(deleteContainerUrl);
        success(`Successfully deleted container with Id ${oldContainer.Id}.`);
      }

      // Delete the Image
      const deleteContainerUrl = `endpoints/${endpointId}/docker/images/${imageTag}`;
      await httpClient.delete(deleteContainerUrl);
      success(`Successfully deleted image ${imageTag}.`);
    } else {
      success(`No images with tag ${imageTag} found.`);
    }
  }

  // Create list of all files inside directory. If we have a whitelist, we use
  // only files on the whitelist. If we have not whitelist, we care about the
  // blacklist and exclude files which are blacklisted
  const fileNames = [];
  let fileFilter = null;
  if (options.buildCtxWhitelist) {
    const whitelist = new Set(options.buildCtxWhitelist);
    fileFilter = (file) => whitelist.has(file);
  } else {
    const blacklist = new Set(options.buildCtxBlacklist);
    fileFilter = (file) => !blacklist.has(file);
  }
  fs.readdirSync(".")
    .filter(fileFilter)
    .forEach((file) => {
      fileNames.push(file);
    });

  // Create a tar file
  if (!fs.existsSync("dist")) {
    fs.mkdirSync("dist");
  }
  const buildCtxPath = "dist/build-ctx-tmp.tar.gz";
  await tar.c({ gzip: true, file: buildCtxPath }, fileNames);
  success(
    `Successfully created build context tar and temporarily stored it at ${buildCtxPath}.`
  );

  // Reading build context from FS
  const buildCtxTar = fs.readFileSync(buildCtxPath);
  success(`Successfully read ${buildCtxPath} from filesystem.`);

  // Build image remotely
  info(`Start building image ${imageTag} remotely.`);
  const dockerfilePath = options.dockerfile || 'Dockerfile';
  const buildImageUrl = `endpoints/${endpointId}/docker/build?dockerfile=${dockerfilePath}&t=${imageTag}`;
  await httpClient.post(buildImageUrl, buildCtxTar, {
    headers: { "Content-Type": "application/x-tar" },
  });
  success(`Successfully build image ${imageTag} remotely.`);

  // Remove build context from filesystem
  fs.unlinkSync(buildCtxPath);
  success(
    `Successfully deleted temporary build context tar at ${buildCtxPath}.`
  );

  // Lookup if container with this name already exists
  const listContainersResp = await httpClient.get(
    `endpoints/${endpointId}/docker/containers/json?all=1`
  );
  const containerName = options.containerName || pJsonName;
  const oldContainer = listContainersResp.data.find((container) =>
    container.Names.some((name) => name === "/" + containerName)
  );

  // If container with name exists, delete the old one.
  if (oldContainer) {
    info(`Container with name ${containerName} already exists.`);
    const deleteContainerUrl = `endpoints/${endpointId}/docker/containers/${oldContainer.Id}?force=true&v=1`;
    await httpClient.delete(deleteContainerUrl);
    success(`Successfully deleted container with Id ${oldContainer.Id}.`);
  }

  // Create new container
  const createContainerUrl = `endpoints/${endpointId}/docker/containers/create?name=${containerName}`;
  const createContainerResp = await httpClient.post(createContainerUrl, {
    Image: imageTag,
    ExposedPorts: options.ExposedPorts,
    HostConfig: options.HostConfig,
  });
  const newContainerId = createContainerResp.data.Id;
  success(`Successfully created container with Id ${newContainerId}.`);

  // Load all teams
  const loadTeamsResp = await httpClient.get(`teams`);
  const teamIds = loadTeamsResp.data.map((team) => team.Id);
  const teamNames = loadTeamsResp.data.map((team) => team.Name).join(", ");

  // Updating ownership of container from private to restricted
  const resourceId = createContainerResp.data.Portainer.ResourceControl.Id;
  await httpClient.put(`resource_controls/${resourceId}`, {
    AdministratorsOnly: false,
    Public: false,
    Teams: teamIds,
    Users: [],
  });
  success(
    `Successfully promoted team ${teamNames} to the owner of the container.`
  );

  // Start container
  const startContainerUrl = `endpoints/${endpointId}/docker/containers/${newContainerId}/start`;
  await httpClient.post(startContainerUrl);
  success(`Successfully started container with Id ${newContainerId}.`);
})().catch((e) => {
  error(e);
});
