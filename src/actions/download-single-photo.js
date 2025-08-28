const piexif = require("piexifjs");
const { Readable } = require("stream");
const { exiftool } = require("exiftool-vendored");
const { getAuthenticatedClient } = require("../oauth");
const { downloadPhoto } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  createFile,
  updateFile,
  findFile,
  FOLDER_NAME,
} = require("../drive-manager");
const { updateState } = require("../download-state");
const { degToDmsRational } = require("../utils/photo-utils");

/**
 * Downloads a single photo to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} photo - The photo object to download.
 */
async function downloadSinglePhoto(req, photo) {
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
  
      // Send initial progress message
      progressCallback({
        message: `Starting download of 1 photo to Google Drive...`,
        total: 1,
        current: 0,
        totalProgress: 0,
      });
  
      const fileName = `${photo.photoId.id}.jpg`;
  
      // Send progress update for the current photo
      progressCallback({
        message: `Processing photo ${fileName}...`,
        total: 1,
        current: 0,
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

      if (typeof photo.pose.altitude === 'number') {
        gpsData[piexif.GPSIFD.GPSAltitude] = [Math.round(photo.pose.altitude * 100), 100];
        gpsData[piexif.GPSIFD.GPSAltitudeRef] = 0;
      }

      if (typeof photo.pose.heading === 'number') {
        gpsData[piexif.GPSIFD.GPSImgDirection] = [Math.round(photo.pose.heading * 100), 100];
        gpsData[piexif.GPSIFD.GPSImgDirectionRef] = "T";
      }
      exifObj["GPS"] = gpsData;
      const exifbytes = piexif.dump(exifObj);
      let newData = piexif.insert(exifbytes, jpegData);
      let newJpeg = Buffer.from(newData, "binary");

      if (typeof photo.pose.pitch === 'number' || typeof photo.pose.roll === 'number') {
        const tags = {
          PosePitchDegrees: photo.pose.pitch || 0,
          PoseRollDegrees: photo.pose.roll || 0,
        };
        newJpeg = await exiftool.write(newJpeg, tags);
      }
  
      // Create a readable stream from the photo data
      const stream = Readable.from(newJpeg);
  
      // Check if the file already exists in Google Drive
      const existingFile = await findFile(drive, fileName, folderId);
  
      // If the file exists, update it. Otherwise, create a new file.
      if (existingFile) {
        await updateFile(
          drive,
          existingFile.id,
          "image/jpeg",
          stream,
          newJpeg.length,
          (percentage) => {
            progressCallback({ uploadProgress: percentage });
          }
        );
      } else {
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
      }
  
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
        totalProgress: 100,
      });
  
      // Send final progress message
      progressCallback({
        message: "Photo downloaded successfully to Google Drive!",
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

module.exports = { downloadSinglePhoto };
