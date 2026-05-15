export const redactGatewayToken = (message, gateway) => {
  const token = gateway?.token;
  if (!token) {
    return message;
  }

  return String(message).split(token).join('[redacted]');
};

const normalizeGatewayUrl = (url) => String(url).replace(/\/+$/, '');
const normalizePath = (path) => String(path).replace(/^\/+/, '');

export const createGalleryToolClient = ({ gateway, gallerySessionId, fetch: fetchImplementation = fetch }) => ({
  async post(path, body, { signal } = {}) {
    const url = `${normalizeGatewayUrl(gateway.url)}/sessions/${encodeURIComponent(gallerySessionId)}/${normalizePath(path)}`;
    const response = await fetchImplementation(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gateway.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body ?? {}),
      signal,
    });

    const text = await response.text();
    try {
      return text.length === 0 ? {} : JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(redactGatewayToken(`Invalid Gallery tool gateway JSON: ${message}: ${text}`, gateway));
    }
  },
});
