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

    const driveFiles = loggedIn ? await listFiles(drive, folderId) : [];
    const drivePhotoCount = driveFiles.filter(f => f.name !== PHOTO_LIST_FILE_NAME).length;
    const downloadedFiles = new Set(driveFiles.map((f) => f.name));
    const totalPhotosCount = photos.length;

    const photoIdsFromStreetView = new Set(photos.map(p => `${p.photoId.id}.jpg`));
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

    const downloadedPhotos = photos.filter((p) =>
      downloadedFiles.has(`${p.photoId.id}.jpg`)
    );
    const missingPhotos = photos.filter(
      (p) => !downloadedFiles.has(`${p.photoId.id}.jpg`)
    );

    if (loggedIn) {
      req.session.allPhotos = photos;
      req.session.photos = missingPhotos;
      req.session.downloadedPhotos = downloadedPhotos;
      req.session.missingPhotos = missingPhotos;
    }

    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = 50;
    const totalPages = Math.ceil(photos.length / pageSize);
    const paginatedPhotos = photos.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

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

    let paginationHtml = "";
    if (totalPages > 1) {
      const buildPageClick = (page) => {
        return `onclick="changePage(${page})"`;
      };

      paginationHtml += '<div class="pagination">';
      if (page > 1) {
        paginationHtml += `<a ${buildPageClick(page - 1)}>Previous</a>`;
      }

      const maxPagesToShow = 10;
      let startPage, endPage;

      if (totalPages <= maxPagesToShow) {
        startPage = 1;
        endPage = totalPages;
      } else {
        const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2);
        const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1;
        if (page <= maxPagesBeforeCurrent) {
          startPage = 1;
          endPage = maxPagesToShow;
        } else if (page + maxPagesAfterCurrent >= totalPages) {
          startPage = totalPages - maxPagesToShow + 1;
          endPage = totalPages;
        } else {
          startPage = page - maxPagesBeforeCurrent;
          endPage = page + maxPagesAfterCurrent;
        }
      }

      if (startPage > 1) {
        paginationHtml += `<a ${buildPageClick(1)}>1</a>`;
        if (startPage > 2) {
          paginationHtml += `<span>...</span>`;
        }
      }

      for (let i = startPage; i <= endPage; i++) {
        if (i === page) {
          paginationHtml += `<span>${i}</span>`;
        } else {
          paginationHtml += `<a ${buildPageClick(i)}>${i}</a>`;
        }
      }

      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          paginationHtml += `<span>...</span>`;
        }
        paginationHtml += `<a ${buildPageClick(totalPages)}>${totalPages}</a>`;
      }

      if (page < totalPages) {
        paginationHtml += `<a ${buildPageClick(page + 1)}>Next</a>`;
      }
      paginationHtml += "</div>";
    }

    res.render("index", {
      isLoggedIn: loggedIn,
      totalPhotos: totalPhotosCount,
      displayedPhotos: photos.length,
      missingPhotosCount: missingPhotos.length,
      search: search,
      status: status,
      folderLink: loggedIn ? folderLink : null,
      downloadState: getState(),
      downloadedCount: loggedIn ? downloadedPhotos.length : 0,
      notDownloadedCount: loggedIn ? missingPhotos.length : 0,
      driveOnlyCount: loggedIn ? driveOnlyCount : 0,
      driveOnlyFiles: loggedIn ? driveOnlyFiles : [],
      drivePhotoCount: loggedIn ? drivePhotoCount : 0,
      duplicateFiles: loggedIn ? duplicateFiles : {},
      duplicateFilesCount: loggedIn ? duplicateFilesCount : 0,
      folderName: folderName,
      photoListHtml: paginatedPhotos
        .map(
          (photo) => `
        <tr>
          <td><a href="${photo.shareLink}" target="_blank">${photo.photoId.id}</a></td>
          <td>${
            photo.places && photo.places.length > 0 && photo.places[0].name
              ? `${photo.places[0].name}<br><small>${photo.pose.latLngPair.latitude.toFixed(4)}, ${photo.pose.latLngPair.longitude.toFixed(4)}</small>`
              : `${photo.pose.latLngPair.latitude.toFixed(4)}, ${photo.pose.latLngPair.longitude.toFixed(4)}`
          }</td>
          <td>${new Date(photo.captureTime).toLocaleDateString()}</td>
          <td>${photo.viewCount || 0}</td>
          <td>${
            downloadedFiles.has(`${photo.photoId.id}.jpg`)
              ? '<span class="status downloaded" title="Downloaded"><span class="status-text">Downloaded</span><span class="status-icon">&#10004;</span></span>'
              : '<span class="status not-downloaded" title="Not Downloaded"><span class="status-text">Not Downloaded</span><span class="status-icon">&#10006;</span></span>'
          }</td>
          <td>
            <button onclick="downloadSinglePhoto('${photo.photoId.id}')" class="button ${
              downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'redownload-btn' : 'download-btn'
            }" style="font-size: 12px; padding: 5px 10px;" title="${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'Re-download' : 'Download'}">
              <span class="button-text">${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'Re-download' : 'Download'}</span>
              <span class="button-icon">${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? '&#10227;' : '&#11015;'}</span>
            </button>
          </td>
        </tr>
      `
        )
        .join(""),
      paginationHtml,
      buildSortLink,
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
