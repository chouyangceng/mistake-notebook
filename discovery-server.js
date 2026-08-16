const dgram = require("dgram");
const crypto = require("crypto");
const os = require("os");

const DISCOVERY_PORT = 17333;

function validNonce(value) {
  return typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
}

function privateIpv4(address) {
  const parts = String(address).split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  )
    return false;
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function localIps() {
  const addresses = [];
  for (const entries of Object.values(os.networkInterfaces()))
    for (const entry of entries || [])
      if (
        entry.family === "IPv4" &&
        !entry.internal &&
        privateIpv4(entry.address)
      )
        addresses.push(entry.address);
  return [...new Set(addresses)].sort();
}

function proofFor(token, nonce, port, ips) {
  return crypto
    .createHmac("sha256", token)
    .update(`shiti|2|${nonce}|${port}|${ips.join(",")}`, "utf8")
    .digest("hex");
}

module.exports = function startDiscovery(token, servicePort) {
  if (!token) throw new Error("自动发现服务缺少配对令牌");
  const port = Number(servicePort) || 17332;
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.on("message", (message, remote) => {
    let request;
    try {
      request = JSON.parse(message.toString("utf8"));
    } catch {
      return;
    }
    if (
      request?.service !== "shiti" ||
      request?.version !== 2 ||
      !validNonce(request?.nonce)
    )
      return;
    const ips = localIps();
    if (!ips.length) return;
    const response = Buffer.from(
      JSON.stringify({
        service: "shiti",
        version: 2,
        port,
        ips,
        nonce: request.nonce,
        proof: proofFor(token, request.nonce, port, ips),
      }),
    );
    socket.send(response, remote.port, remote.address);
  });
  socket.on("error", (error) =>
    console.error("拾题自动发现服务异常:", error.message),
  );
  socket.bind(DISCOVERY_PORT, "0.0.0.0", () => {
    socket.setBroadcast(true);
    console.log(`拾题自动发现已启动: UDP ${DISCOVERY_PORT}`);
  });
  return socket;
};
