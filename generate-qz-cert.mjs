/**
 * node generate-qz-cert.mjs
 * Generates qz-private.pem and qz-certificate.pem for QZ Tray.
 * Delete both files after uploading to Vercel.
 */

import { execSync } from "child_process";
import { writeFileSync, existsSync } from "fs";
import { createRequire } from "module";

if (!existsSync("node_modules/node-forge")) {
  console.log("Installing node-forge...");
  execSync("npm install node-forge --no-save", { stdio: "inherit" });
}

const require = createRequire(import.meta.url);
const forge = require("node-forge");

console.log("Generating 2048-bit RSA keypair (takes a few seconds)...");

const keys = forge.pki.rsa.generateKeyPair(2048);
const cert = forge.pki.createCertificate();

cert.publicKey = keys.publicKey;
cert.serialNumber = "01";
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

const attrs = [{ name: "commonName", value: "dragonforceops" }];
cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keys.privateKey, forge.md.sha256.create());

const privatePem = forge.pki.privateKeyToPem(keys.privateKey);
const certPem    = forge.pki.certificateToPem(cert);

writeFileSync("qz-private.pem", privatePem);
writeFileSync("qz-certificate.pem", certPem);

console.log("");
console.log("Done! Two files created:");
console.log("");
console.log("  qz-private.pem     → Vercel: QZ_PRIVATE_KEY           (mark sensitive ✓)");
console.log("  qz-certificate.pem → Vercel: NEXT_PUBLIC_QZ_CERTIFICATE (do NOT mark sensitive)");
console.log("  qz-certificate.pem → also copy to %APPDATA%\\qz\\digital-certificate.txt on each PC");
console.log("");
console.log("Delete both .pem files from this folder when done.");
