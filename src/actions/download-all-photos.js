const piexif = require("piexifjs");
const { Readable } = require("stream");
const { getAuthenticatedClient } = require("../oauth");
const { downloadPhoto } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  createFile,
  listFiles,
  FOLDER_NAME,
} = require("../drive-manager");
const { updateState, getState } = require("../download-state");

/**
 * Converts degrees to degrees-minutes-seconds rational format for EXIF data.
 * @param {number} deg - The degree value.
 * @returns {Array<Array<number>>} The DMS rational value.
 */
function degToDmsRational(deg) {
  const d = Math.floor(deg);
  const minFloat = (deg - d) * 60;
  const m = Math.floor(minFloat);
  const secFloat = (minFloat - m) * 60;
  const s = Math.round(secFloat * 100);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

/**
 * Downloads all photos that are missing from Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {Array<object>} photos - The list of photos to download.
 * @param {number} downloadedPhotosCount - The number of photos already downloaded.
 * @param {number} missingPhotosCount - The number of photos to download.
 */
async function downloadAllPhotos(req, photos, downloadedPhotosCount, missingPhotosCount) {
  /**
   * Sends progress updates to the client.
   * @param {object} progress - The progress object.
   */
  const progressCallback = (progress) => {
    updateState(progress);
  };

  try {
    // Get authenticated clients for Google Drive and Street View
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);

    // Find or create the folder in Google Drive
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    // Get the list of existing files in the Drive folder
    const driveFiles = await listFiles(drive, folderId);
    const existingFileNames = new Set(driveFiles.map((f) => f.name));

    // Calculate initial progress
    const totalPhotos = photos.length;
    const totalPhotoCount = downloadedPhotosCount + missingPhotosCount;
    const initialProgress =
      totalPhotoCount > 0
        ? Math.round((downloadedPhotosCount / totalPhotoCount) * 100)
        : 0;

    // Send initial progress message
    progressCallback({
      message: `Starting download of ${totalPhotos} photos to Google Drive...`,
      total: totalPhotos,
      current: 0,
      totalProgress: initialProgress,
    });

    // Loop through each photo and download it
    for (let i = 0; i < photos.length; i++) {
      // Check if the download has been cancelled
      if (getState().cancelled) {
        progressCallback({
          message: "Cancelling...",
        });
        break;
      }
      const photo = photos[i];
      const fileName = `${photo.photoId.id}.jpg`;

      // Skip if the file already exists in Google Drive
      if (existingFileNames.has(fileName)) {
        progressCallback({
          message: `Skipping existing file: ${fileName}`,
        });
        // Update session data
        if (req.session.missingPhotos && req.session.downloadedPhotos) {
          const downloadedPhotoIndex = req.session.missingPhotos.findIndex(
            (p) => p.photoId.id === photo.photoId.id
          );
          if (downloadedPhotoIndex > -1) {
            const [downloadedPhoto] = req.session.missingPhotos.splice(
              downloadedPhotoIndex,
              1
            );
            req.session.downloadedPhotos.push(downloadedPhoto);
          }
        }
        // Send progress update
        progressCallback({
          fileComplete: true,
          downloadedCount: req.session.downloadedPhotos.length,
          notDownloadedCount: req.session.missingPhotos.length,
          totalProgress: Math.round(
            ((downloadedPhotosCount + i + 1) /
              (downloadedPhotosCount + missingPhotosCount)) *
              100
          ),
        });
        continue;
      }

      // Send progress update for the current photo
      progressCallback({
        message: `Processing photo ${downloadedPhotosCount + i + 1} of ${totalPhotoCount} (${fileName})...`,
        total: totalPhotos,
        current: i,
        photoId: photo.photoId.id,
        downloadProgress: 0,
        uploadProgress: 0,
      });

      // Download the photo data
      const { data } = await downloadPhoto(
        photo.downloadUrl,
        oAuth2Client,
        (percentage) => {
          progressCallback({ downloadProgress: percentage });
        }
      );

      // Check if the download has been cancelled
      if (getState().cancelled) {
        progressCallback({
          message: "Cancelling...",
        });
        break;
      }

      // Add GPS data to the photo's EXIF
      const jpegData = data.toString("binary");
      const exifObj = piexif.load(jpegData);
      const lat = photo.pose.latLngPair.latitude;
      const lng = photo.pose.latLngPair.longitude;
      const gpsData = {
        [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? "S" : "N",
        [piexif.GPSIFD.GPSLatitude]: degToDmsRational(Math.abs(lat)),
        [piexif.GPSIFD.GPSLongitudeRef]: lng < 0 ? "W" : "E",
        [piexif.GPSIFD.GPSLongitude]: degToDmsRational(Math.abs(lng)),
      };
      exifObj["GPS"] = gpsData;
      const exifbytes = piexif.dump(exifObj);
      const newData = piexif.insert(exifbytes, jpegData);
      const newJpeg = Buffer.from(newData, "binary");

      // Create a readable stream from the photo data
      const stream = Readable.from(newJpeg);

      // Create the file in Google Drive
      await createFile(
        drive,
        fileName,
        "image/jpeg",
        stream,
        folderId,
        newJpeg.length,
        (percentage) => {
          progressCallback({ uploadProgress: percentage });
        }
      );

      // Update session data
      if (req.session.missingPhotos && req.session.downloadedPhotos) {
        const downloadedPhotoIndex = req.session.missingPhotos.findIndex(
          (p) => p.photoId.id === photo.photoId.id
        );
        if (downloadedPhotoIndex > -1) {
          const [downloadedPhoto] = req.session.missingPhotos.splice(
            downloadedPhotoIndex,
            1
          );
          req.session.downloadedPhotos.push(downloadedPhoto);
        }
      }

      // Send progress update
      progressCallback({
        fileComplete: true,
        downloadedCount: req.session.downloadedPhotos.length,
        notDownloadedCount: req.session.missingPhotos.length,
        totalProgress: Math.round(
          ((downloadedPhotosCount + i + 1) /
            (downloadedPhotosCount + missingPhotosCount)) *
            100
        ),
      });
    }

    // Clean up session data and send final progress message
    delete req.session.photos;
    progressCallback({
      message: "All photos downloaded successfully to Google Drive!",
      complete: true,
      inProgress: false,
    });
  } catch (error) {
    // Handle errors
    progressCallback({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
    });
    console.error(error);
  }
}

module.exports = { downloadAllPhotos };
