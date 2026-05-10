"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const CACHE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const CERT_VALID_DAYS = 365;
const CACHE_DIR = path.join(os.tmpdir(), "local-https-helper");
const KEY_PATH = path.join(CACHE_DIR, "cert.key");
const CERT_PATH = path.join(CACHE_DIR, "cert.pem");

function len(bytes) {
  if (bytes < 0x80) return Buffer.from([bytes]);

  const parts = [];
  let value = bytes;
  while (value > 0) {
    parts.unshift(value & 0xff);
    value >>= 8;
  }

  return Buffer.from([0x80 | parts.length, ...parts]);
}

function tlv(tag, value) {
  return Buffer.concat([Buffer.from([tag]), len(value.length), value]);
}

function seq(...items) {
  return tlv(0x30, Buffer.concat(items));
}

function set(...items) {
  return tlv(0x31, Buffer.concat(items));
}

function integer(value) {
  let bytes;
  if (Buffer.isBuffer(value)) {
    bytes = Buffer.from(value);
  } else {
    const parts = [];
    let current = BigInt(value);
    while (current > 0n) {
      parts.unshift(Number(current & 0xffn));
      current >>= 8n;
    }
    bytes = Buffer.from(parts.length ? parts : [0]);
  }

  if (bytes[0] & 0x80) {
    bytes = Buffer.concat([Buffer.from([0]), bytes]);
  }

  return tlv(0x02, bytes);
}

function bool(value) {
  return tlv(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function bitString(value) {
  return tlv(0x03, Buffer.concat([Buffer.from([0]), value]));
}

function octetString(value) {
  return tlv(0x04, value);
}

function nullValue() {
  return tlv(0x05, Buffer.alloc(0));
}

function utf8(value) {
  return tlv(0x0c, Buffer.from(value, "utf8"));
}

function ia5(value) {
  return Buffer.from(value, "ascii");
}

function oid(value) {
  const parts = value.split(".").map((part) => Number(part));
  const encoded = [parts[0] * 40 + parts[1]];

  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    let current = part >> 7;
    while (current > 0) {
      stack.unshift(0x80 | (current & 0x7f));
      current >>= 7;
    }
    encoded.push(...stack);
  }

  return tlv(0x06, Buffer.from(encoded));
}

function utcTime(date) {
  const year = String(date.getUTCFullYear()).slice(-2);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return tlv(0x17, Buffer.from(`${year}${month}${day}${hour}${minute}${second}Z`, "ascii"));
}

function explicit(tagNumber, value) {
  return tlv(0xa0 + tagNumber, value);
}

function contextPrimitive(tagNumber, value) {
  return tlv(0x80 + tagNumber, value);
}

function algorithmIdentifier() {
  return seq(oid("1.2.840.113549.1.1.11"), nullValue());
}

function name(commonName) {
  return seq(set(seq(oid("2.5.4.3"), utf8(commonName))));
}

function extension(extensionOid, value, critical = false) {
  const items = [oid(extensionOid)];
  if (critical) items.push(bool(true));
  items.push(octetString(value));
  return seq(...items);
}

function subjectAltName() {
  const localhost = contextPrimitive(2, ia5("localhost"));
  const loopback = contextPrimitive(7, Buffer.from([127, 0, 0, 1]));
  return extension("2.5.29.17", seq(localhost, loopback));
}

function basicConstraints() {
  return extension("2.5.29.19", seq(), true);
}

function keyUsage() {
  return extension("2.5.29.15", bitString(Buffer.from([0xa0])), true);
}

function extendedKeyUsage() {
  return extension("2.5.29.37", seq(oid("1.3.6.1.5.5.7.3.1")));
}

function toPem(label, der) {
  const body = der
    .toString("base64")
    .replace(/.{1,64}/g, "$&\n")
    .trimEnd();
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

function isFresh(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return Date.now() - stat.mtimeMs <= CACHE_MAX_AGE_MS;
  } catch {
    return false;
  }
}

function readCachedCertificate() {
  if (!isFresh(KEY_PATH) || !isFresh(CERT_PATH)) return null;

  return {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH)
  };
}

function createCertificate() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048
  });

  const privateKeyPem = privateKey.export({
    type: "pkcs8",
    format: "pem"
  });
  const publicKeyDer = publicKey.export({
    type: "spki",
    format: "der"
  });

  const now = new Date();
  const notBefore = new Date(now.getTime() - 60 * 1000);
  const notAfter = new Date(now.getTime() + CERT_VALID_DAYS * 24 * 60 * 60 * 1000);
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;

  const tbsCertificate = seq(
    explicit(0, integer(2)),
    integer(serial),
    algorithmIdentifier(),
    name("localhost"),
    seq(utcTime(notBefore), utcTime(notAfter)),
    name("localhost"),
    publicKeyDer,
    explicit(
      3,
      seq(subjectAltName(), basicConstraints(), keyUsage(), extendedKeyUsage())
    )
  );

  const signer = crypto.createSign("SHA256");
  signer.update(tbsCertificate);
  signer.end();

  const signature = signer.sign(privateKeyPem);
  const certificateDer = seq(tbsCertificate, algorithmIdentifier(), bitString(signature));

  return {
    key: Buffer.from(privateKeyPem),
    cert: Buffer.from(toPem("CERTIFICATE", certificateDer))
  };
}

function getCertificateOptions() {
  const cached = readCachedCertificate();
  if (cached) return cached;

  const generated = createCertificate();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(KEY_PATH, generated.key);
  fs.writeFileSync(CERT_PATH, generated.cert);
  return generated;
}

module.exports = getCertificateOptions;
module.exports.getCertificateOptions = getCertificateOptions;
module.exports.paths = {
  dir: CACHE_DIR,
  key: KEY_PATH,
  cert: CERT_PATH
};
