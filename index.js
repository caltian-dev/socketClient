import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

export default async function handler(req, res) {
  if (req.url !== "/") {
    res.statusCode = 404;
    res.end("Not Found");
    return;
  }

  try {
    // Set the response HTTP header
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");

    const code = fs.readFileSync("socket_client.js", "utf8");
    const obfuscatedCode = JavaScriptObfuscator.obfuscate(code, {
      compact: true,
      controlFlowFlattening: true,
    });

    const result = obfuscatedCode.getObfuscatedCode();

    res.end(result);
  } catch (error) {
    console.error("Error:", error.response?.data || error.message);
    throw new Error("Failed");
  }
}
