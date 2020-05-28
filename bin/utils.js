const read = require("read");

module.exports = {
  read(options) {
    return new Promise((resolve, reject) => {
      read(options, (error, result, isDefault) => {
        if (error) {
          reject();
        } else {
          resolve(result);
        }
      })
    });
  },
};
