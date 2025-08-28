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

function calculatePoseCounts(photos) {
    const poseCounts = {
        heading: { exists: 0, missing: 0 },
        pitch: { exists: 0, missing: 0 },
        roll: { exists: 0, missing: 0 },
        altitude: { exists: 0, missing: 0 },
        latLngPair: { exists: 0, missing: 0 },
    };

    photos.forEach(photo => {
        if (photo.pose) {
            if (typeof photo.pose.heading === 'number') poseCounts.heading.exists++; else poseCounts.heading.missing++;
            if (typeof photo.pose.pitch === 'number') poseCounts.pitch.exists++; else poseCounts.pitch.missing++;
            if (typeof photo.pose.roll === 'number') poseCounts.roll.exists++; else poseCounts.roll.missing++;
            if (typeof photo.pose.altitude === 'number') poseCounts.altitude.exists++; else poseCounts.altitude.missing++;
            if (photo.pose.latLngPair !== undefined) poseCounts.latLngPair.exists++; else poseCounts.latLngPair.missing++;
        } else {
            poseCounts.heading.missing++;
            poseCounts.pitch.missing++;
            poseCounts.roll.missing++;
            poseCounts.altitude.missing++;
            poseCounts.latLngPair.missing++;
        }
    });

    return poseCounts;
}

function buildPhotoListHtml(photos, downloadedFiles) {
  return photos
    .map((photo) => {
      const poseParts = [];
      if (photo.pose) {
        if (typeof photo.pose.heading === 'number') poseParts.push(`<span style="white-space: nowrap;" title="Heading: ${photo.pose.heading.toFixed(2)}°"><strong>H</strong> ${photo.pose.heading.toFixed(2)}</span>`);
        if (typeof photo.pose.pitch === 'number') poseParts.push(`<span style="white-space: nowrap;" title="Pitch: ${photo.pose.pitch.toFixed(2)}°"><strong>P</strong> ${photo.pose.pitch.toFixed(2)}</span>`);
        if (typeof photo.pose.roll === 'number') poseParts.push(`<span style="white-space: nowrap;" title="Roll: ${photo.pose.roll.toFixed(2)}°"><strong>R</strong> ${photo.pose.roll.toFixed(2)}</span>`);
        if (typeof photo.pose.altitude === 'number') poseParts.push(`<span style="white-space: nowrap;" title="Altitude: ${photo.pose.altitude.toFixed(2)}m"><strong>A</strong> ${photo.pose.altitude.toFixed(2)}</span>`);
      }
      const poseString = poseParts.length > 0 ? `<br><small>${poseParts.join(' ')}</small>` : '';

      const locationName = photo.places && photo.places.length > 0 && photo.places[0].name;
      const lat = photo.pose.latLngPair.latitude;
      const lon = photo.pose.latLngPair.longitude;
      const coordinates = `<small><span title="Latitude: ${lat.toFixed(4)}, Longitude: ${lon.toFixed(4)}">${lat.toFixed(4)}, ${lon.toFixed(4)}</span></small>`;
      const locationHtml = locationName ? `${locationName}<br>${coordinates}` : coordinates;

      return `
    <tr>
      <td><a href="${photo.shareLink}" target="_blank">${photo.photoId.id}</a></td>
      <td>${locationHtml}${poseString}</td>
      <td>${new Date(photo.captureTime).toLocaleDateString()}</td>
      <td>${photo.viewCount || 0}</td>
      <td>${
        downloadedFiles.has(`${photo.photoId.id}.jpg`)
          ? '<span class="status downloaded" title="Downloaded"><span class="status-text">Downloaded</span><span class="status-icon">&#10004;</span></span>'
          : '<span class="status not-downloaded" title="Not Downloaded"><span class="status-text">Not Downloaded</span><span class="status-icon">&#10006;</span></span>'
      }</td>
      <td>
        <button data-photo-id="${photo.photoId.id}" class="button download-single-btn ${
          downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'redownload-btn' : 'download-btn'
        }" style="font-size: 12px; padding: 5px 10px;" title="${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'Re-download' : 'Download'}">
          <span class="button-text">${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? 'Re-download' : 'Download'}</span>
          <span class="button-icon">${downloadedFiles.has(`${photo.photoId.id}.jpg`) ? '&#10227;' : '&#11015;'}</span>
        </button>
      </td>
    </tr>
  `;
    })
    .join("");
}

function buildPaginationHtml(totalPages, currentPage, action, location) {
  let paginationHtml = "";
  if (totalPages > 1) {
    const buildPageClick = (page) => {
      return `onclick="${action}(${page}, '${location}')"`;
    };

    paginationHtml += `<div class="pagination" data-location="${location}">`;
    if (currentPage > 1) {
      paginationHtml += `<button ${buildPageClick(currentPage - 1)}>Previous</button>`;
    }

    const maxPagesToShow = 7;
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
      startPage = 1;
      endPage = totalPages;
    } else {
      const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2);
      const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1;
      if (currentPage <= maxPagesBeforeCurrent) {
        startPage = 1;
        endPage = maxPagesToShow;
      } else if (currentPage + maxPagesAfterCurrent >= totalPages) {
        startPage = totalPages - maxPagesToShow + 1;
        endPage = totalPages;
      } else {
        startPage = currentPage - maxPagesBeforeCurrent;
        endPage = currentPage + maxPagesAfterCurrent;
      }
    }

    if (startPage > 1) {
      paginationHtml += `<button ${buildPageClick(1)}>1</button>`;
      if (startPage > 2) {
        paginationHtml += `<span>...</span>`;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        paginationHtml += `<button disabled>${i}</button>`;
      } else {
        paginationHtml += `<button ${buildPageClick(i)}>${i}</button>`;
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHtml += `<span>...</span>`;
      }
      paginationHtml += `<button ${buildPageClick(totalPages)}>${totalPages}</button>`;
    }

    if (currentPage < totalPages) {
      paginationHtml += `<button ${buildPageClick(currentPage + 1)}>Next</button>`;
    }
    paginationHtml += "</div>";
  }
  return paginationHtml;
}

module.exports = { calculatePoseCounts, buildPhotoListHtml, buildPaginationHtml, degToDmsRational };