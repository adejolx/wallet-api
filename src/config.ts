export const parsePort = (rawPort: string = "3000"): number => {
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${rawPort}`);
  }

  return port;
};
