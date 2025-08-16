const { google } = require("googleapis");
const axios = require("axios");
const piexif = require("piexifjs");

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
 * Downloads a single photo and returns it as a buffer.
 * @param {string} photoUrl The URL of the photo to download.
 * @param {import('google-auth-library').OAuth2Client} authClient An authorized OAuth2 client.
 * @param {(percentage: number) => void} [progressCallback=() => {}] An optional function to log progress.
 * @returns {Promise<{buffer: Buffer, size: number}>} A promise that resolves with the photo buffer and size.
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
      if (progressEvent.total) {
        const percentage = Math.round(
          (progressEvent.loaded / progressEvent.total) * 100
        );
        progressCallback(percentage);
      }
    },
  });

  return { buffer: Buffer.from(response.data), size: response.headers["content-length"] };
}

/**
 * Adds GPS EXIF data to a photo.
 * @param {Buffer} photoBuffer The photo data.
 * @param {object} photoMetadata The photo metadata containing location info.
 * @returns {Buffer} The photo data with EXIF info.
 */
function addExifData(photoBuffer, photoMetadata) {
  if (
    !photoMetadata.pose ||
    !photoMetadata.pose.latLngPair ||
    !photoMetadata.pose.latLngPair.latitude ||
    !photoMetadata.pose.latLngPair.longitude
  ) {
    return photoBuffer;
  }

  const { latitude, longitude } = photoMetadata.pose.latLngPair;
  const zeroth = {};
  const exif = {};
  const gps = {};

  gps[piexif.GPSIFD.GPSLatitudeRef] = latitude >= 0 ? "N" : "S";
  gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDms(Math.abs(latitude));
  gps[piexif.GPSIFD.GPSLongitudeRef] = longitude >= 0 ? "E" : "W";
  gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDms(Math.abs(longitude));

  const exifObj = { "0th": zeroth, Exif: exif, GPS: gps };
  const exifbytes = piexif.dump(exifObj);
  const jpeg = photoBuffer.toString("binary");
  const newData = piexif.insert(exifbytes, jpeg);
  
  return Buffer.from(newData, "binary");
}

module.exports = { listAllPhotos, downloadPhoto, addExifData };
