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
    responseType: "arraybuffer",
    headers: {
      Authorization: `Bearer ${authClient.credentials.access_token}`,
    },
    onDownloadProgress: (progressEvent) => {
      const percentage = Math.round(
        (progressEvent.loaded * 100) / progressEvent.total
      );
      progressCallback(percentage);
    },
  });

  return { data: Buffer.from(response.data), size: response.data.length };
}

function filterPhotos(allPhotos, { search, status, filters, downloadedFiles }) {
  const filteredBySearch = allPhotos.filter(photo => {
    if (!search) {
      return true;
    }
    if (photo.places && photo.places.length > 0 && photo.places[0].name) {
      return photo.places[0].name.toLowerCase().includes(search.toLowerCase());
    }
    return false;
  });

  const filteredByStatus = filteredBySearch.filter(photo => {
    if (status === 'all') {
      return true;
    }
    const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
    return status === 'downloaded' ? isDownloaded : !isDownloaded;
  });

  const filteredByPose = filteredByStatus.filter(photo => {
    if (!filters || filters.length === 0) {
      return true;
    }
    return filters.every(filter => {
      if (filter.value === 'any') {
        return true;
      }
      const exists = filter.property === 'latLngPair'
        ? photo.pose && photo.pose.latLngPair !== undefined
        : photo.pose && typeof photo.pose[filter.property] === 'number';
      return filter.value === 'exists' ? exists : !exists;
    });
  });

  return filteredByPose;
}

module.exports = { listAllPhotos, downloadPhoto, filterPhotos };
