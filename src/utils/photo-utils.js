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

module.exports = { calculatePoseCounts };
