const { google } = require("googleapis");
const axios = require("axios");

/**
 * Lists all photos for the authenticated user, handling pagination.
 * @param {import('google-auth-library').OAuth2Client} authClient An authorized OAuth2 client.
 * @param {(message: string) => void} [log=() => {}] An optional function to log progress messages.
 */
async function listAllPhotos(authClient, progressCallback = () => {}) {
  const streetviewpublish = google.streetviewpublish({
    version: "v1",
    auth: authClient,
  });
  const allPhotos = [];
  let nextPageToken = null;

  progressCallback({ message: "Fetching photo list...", count: 0 });

  do {
    const res = await streetviewpublish.photos.list({
      view: "INCLUDE_DOWNLOAD_URL",
      pageSize: 100,
      pageToken: nextPageToken,
    });

    if (res.data.photos && res.data.photos.length > 0) {
      allPhotos.push(...res.data.photos);
      progressCallback({
        message: `Found ${allPhotos.length} photos...`,
        count: allPhotos.length,
      });
    }
    nextPageToken = res.data.nextPageToken;
  } while (nextPageToken);

  progressCallback({
    message: `Found ${allPhotos.length} total photos.`,
    count: allPhotos.length,
    complete: true,
  });
  return allPhotos;
}

/**
 * Downloads a single photo to the download directory.
 * @param {object} photo The photo metadata object from the API.
 * @param {(message: string) => void} log A function to log progress messages.
 */
async function downloadPhoto(photoUrl, authClient, progressCallback = () => {}) {
  const response = await axios({
    method: "GET",
    url: photoUrl,
    responseType: "stream",
    headers: {
      Authorization: `Bearer ${authClient.credentials.access_token}`,
    },
  });

  const totalLength = response.headers["content-length"];
  let downloadedLength = 0;

  response.data.on("data", (chunk) => {
    downloadedLength += chunk.length;
    if (totalLength) {
      const percentage = Math.round((downloadedLength / totalLength) * 100);
      progressCallback(percentage);
    }
  });

  return { stream: response.data, size: totalLength };
}

module.exports = { listAllPhotos, downloadPhoto };
