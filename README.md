# Deploy-Portainer Tool

Tool to deploy a docker project to portainer from the cli. Since this tool uses the portainer http-api and not the docker-engine-api directly, you need to have portainer running on your docker host. This tool creates a tar.gz of your workspace and uploades it to docker. Then a docker image is built and deployed on the remote machine. Its up to you create the build locally and pass only the build output as build-context for the docker build or if you upload your source files and perform the build on the remote machine. The first approch can be faster since you dont need to install the dependencies again. But i can also be slower when u have a npm project without a bundler and have to upload all your node_modules together with your build output.

## Installation

Run `npm install -D git+https://github.com/kaisnb/deploy-portainer.git` to install the tool directly from github.

## Run

To run the tool call `npx deploy-portainer config=deploy-conf.json` or add a script to your package json `"deploy": "deploy-portainer config=deploy-conf.json"`.

## Configuration

These are all possible configration parameters. Only the portainerHost parameter is required. This is a sample configuration:

```json
{
  "portainerHost": "192.123.249.12",
  "portainerPort": "3857",
  "portainerBaseUrl": "/api/",
  "endpointName": "remote",
  "imageName": "my-image",
  "imageVersion": "0.1.0",
  "overrideOldImage": true,
  "dockerfile": "cd/env/dev/Dockerfile",
  "containerName": "mt-frontend-nginx",
  "buildCtxWhitelist": ["dist"],
  "buildCtxBlacklist": ["node_modules"],
  "ExposedPorts": {
    "80/tcp": {}
  },
  "HostConfig": {
    "RestartPolicy": { "Name": "always" }
  }
}
```

- **portainerHost** — (required) Adress of the portainer host.

- **portainerPort** — (default: 9000) Port of the portainer host.

- **portainerBaseUrl** — (default: api/) Base-URL of the portainer API.

- **endpointName** — (default: local) Name of the docker endpoint on your portainer dashboard.

- **imageName** — (default: name property package.json) Name of the docker image to be created.

- **imageVersion** — (default: version property package.json) Version of the docker image to be created.

- **overrideOldImage** — (default: false) If true an image with the same name will be deleted instead of renamed. Depending containers are also removed.

- **dockerfile** — (default: Dockerfile) Path to the Dockerfile.

- **containerName** — (default: name property package.json) Name of the dockercontainer to be created.

- **buildCtxWhitelist** — (default: undefined) If specified only files on this list will be uploaded as build context and the blacklist is ignored. If not all files except the files on the blacklist are used.

- **buildCtxWhitelist** — (default: undefined) Does have have no effect if a whilelist is specified. If not all files except the files on the blacklist are used as build context.

- **ExposedPorts** — (default: undefined) Ports to be exposed when the container is created.

- **HostConfig** — (default: undefined) Host config to be used when the container is created.

## License

Everything in this repository is [licensed under the MIT License][license] unless otherwise specified.

Copyright (c) 2019 Kai Schönberger

[license]: https://github.com/kaisnb/create-war/blob/master/LICENSE
