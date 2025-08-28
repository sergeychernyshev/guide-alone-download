const express = require("express");
const {
  getOAuthClient,
  getAuthenticatedClient,
  isLoggedIn,
  login,
  logout,
} = require("../oauth");
const { listAllPhotos } = require("../photo-manager");
const {
  getDriveClient,
  findOrCreateFolder,
  getPhotoListFile,
  readFileContent,
  writeFileContent,
  listFiles,
  FOLDER_NAME,
  PHOTO_LIST_FILE_NAME,
} = require("../drive-manager");
const { getState } = require("../download-state");
const { calculatePoseCounts, buildPhotoListHtml, buildPaginationHtml } = require("../utils/photo-utils");

const router = express.Router();

router.get("/", async (req, res, next) => {
  const loggedIn = isLoggedIn(req);

  try {
    let photos = [];
    let drive;
    let folderLink;
    let folderId;
    let folderName = FOLDER_NAME;

    if (loggedIn) {
      const oAuth2Client = await getAuthenticatedClient(req);
      drive = await getDriveClient(oAuth2Client);
      const folder = await findOrCreateFolder(drive, FOLDER_NAME);
      folderLink = folder.webViewLink;
      folderId = folder.id;
      folderName = folder.name;

      let photoListFile = await getPhotoListFile(drive, folderId);

      if (photoListFile) {
        photos = await readFileContent(drive, photoListFile.id);
      } else {
        photos = await listAllPhotos(oAuth2Client);
        const newFile = await drive.files.create({
          resource: {
            name: PHOTO_LIST_FILE_NAME,
            parents: [folderId],
          },
          media: {
            mimeType: "application/json",
            body: JSON.stringify(photos, null, 2),
          },
          fields: "id",
        });
      }
    }

    const search = req.query.search || "";
    const status = req.query.status || "all";
    const poseQuery = req.query.pose || "";
    const poseFilters = poseQuery.split(',').filter(Boolean).map(p => {
      const [property, value] = p.split(':');
      return { property, value };
    });

    const searchedPhotos = photos.filter(photo => {
      if (!search) {
        return true;
      }
      if (photo.places && photo.places.length > 0 && photo.places[0].name) {
        return photo.places[0].name.toLowerCase().includes(search.toLowerCase());
      }
      return false;
    });

    const driveFiles = loggedIn ? await listFiles(drive, folderId) : [];
    const drivePhotoCount = driveFiles.filter(f => f.name !== PHOTO_LIST_FILE_NAME).length;
    const downloadedFiles = new Set(driveFiles.map((f) => f.name));

    const statusFilteredPhotos = searchedPhotos.filter(photo => {
      if (status === 'all') {
        return true;
      }
      const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
      return status === 'downloaded' ? isDownloaded : !isDownloaded;
    });

    const poseFilteredPhotos = statusFilteredPhotos.filter(photo => {
      if (!poseFilters || poseFilters.length === 0) {
        return true;
      }
      return poseFilters.every(filter => {
        if (filter.value === 'any') {
          return true;
        }
        const exists = filter.property === 'latLngPair'
          ? photo.pose && photo.pose.latLngPair !== undefined
          : photo.pose && typeof photo.pose[filter.property] === 'number';
        return filter.value === 'exists' ? exists : !exists;
      });
    });

    const filteredPhotos = poseFilteredPhotos;

    const totalPhotosCount = photos.length;
    const downloadedCount = photos.filter(p => downloadedFiles.has(`${p.photoId.id}.jpg`)).length;
    const notDownloadedCount = totalPhotosCount - downloadedCount;

    const poseCounts = calculatePoseCounts(photos);

    const photoIdsFromStreetView = new Set(filteredPhotos.map(p => `${p.photoId.id}.jpg`));
    const driveOnlyFiles = driveFiles.filter(f => f.name !== PHOTO_LIST_FILE_NAME && !photoIdsFromStreetView.has(f.name));
    const driveOnlyCount = driveOnlyFiles.length;

    const duplicates = driveFiles.reduce((acc, file) => {
      acc[file.name] = acc[file.name] || [];
      acc[file.name].push(file);
      return acc;
    }, {});

    const duplicateFiles = Object.keys(duplicates).reduce((acc, key) => {
      if (duplicates[key].length > 1) {
        acc[key] = duplicates[key];
      }
      return acc;
    }, {});
    const duplicateFilesCount = Object.keys(duplicateFiles).length;

    const downloadedPhotos = filteredPhotos.filter((p) =>
      downloadedFiles.has(`${p.photoId.id}.jpg`)
    );
    const missingPhotos = filteredPhotos.filter(
      (p) => !downloadedFiles.has(`${p.photoId.id}.jpg`)
    );

    if (loggedIn) {
      req.session.allPhotos = photos;
      const allDownloadedPhotos = photos.filter((p) => downloadedFiles.has(`${p.photoId.id}.jpg`));
      const allMissingPhotos = photos.filter((p) => !downloadedFiles.has(`${p.photoId.id}.jpg`));
      req.session.downloadedPhotos = allDownloadedPhotos;
      req.session.missingPhotos = allMissingPhotos;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 50;
    const totalPages = Math.ceil(filteredPhotos.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPhotos = filteredPhotos.slice(startIndex, endIndex);

    const buildSortLink = (sortBy, label) => {
      const currentSort = req.query.sort || "date";
      const currentOrder = req.query.order || "desc";
      let order = "asc";
      let indicator = "";
      if (currentSort === sortBy) {
        if (currentOrder === "asc") {
          order = "desc";
          indicator = " &uarr;";
        } else {
          order = "asc";
          indicator = " &darr;";
        }
      }
      return `<a class="sort-link" href="/?sort=${sortBy}&order=${order}&search=${search}&status=${status}">${label}${indicator}</a>`;
    };

    const paginationHtmlTop = buildPaginationHtml(totalPages, page, 'changePage', 'top');
    const paginationHtmlBottom = buildPaginationHtml(totalPages, page, 'changePage', 'bottom');

    res.render("index", {
      isLoggedIn: loggedIn,
      totalPhotos: totalPhotosCount,
      displayedPhotos: filteredPhotos.length,
      missingPhotosCount: missingPhotos.length,
      search: search,
      status: status,
      folderLink: loggedIn ? folderLink : null,
      downloadState: getState(),
      downloadedCount: loggedIn ? downloadedCount : 0,
      notDownloadedCount: loggedIn ? notDownloadedCount : 0,
      driveOnlyCount: loggedIn ? driveOnlyCount : 0,
      driveOnlyFiles: loggedIn ? driveOnlyFiles : [],
      drivePhotoCount: loggedIn ? drivePhotoCount : 0,
      duplicateFiles: loggedIn ? duplicateFiles : {},
      duplicateFilesCount: loggedIn ? duplicateFilesCount : 0,
      folderName: folderName,
      photoListHtml: buildPhotoListHtml(paginatedPhotos, downloadedFiles),
      paginationHtmlTop,
      paginationHtmlBottom,
      buildSortLink,
      totalPhotosCount,
      poseCounts: loggedIn ? poseCounts : {},
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, filteredPhotos.length),
      filteredTotal: filteredPhotos.length,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/login", async (req, res, next) => {
  try {
    const oAuth2Client = await getOAuthClient();
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: [
        "https://www.googleapis.com/auth/streetviewpublish",
        "https://www.googleapis.com/auth/drive.file",
      ],
      prompt: "consent",
    });
    res.redirect(authUrl);
  } catch (error) {
    next(error);
  }
});

router.get("/oauth2callback", async (req, res, next) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).send("Authorization code is missing.");
  }
  try {
    await login(req, code);
    res.redirect("/");
  } catch (error) {
    next(error);
  }
});

router.get("/logout", (req, res) => {
  logout(req, () => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

module.exports = router;
