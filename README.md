# Google Maps 360 Photo Downloader

This tool allows you to download your 360 photos from Google Maps Street View and back them up to your Google Drive. It provides a web interface to view your photos, see which ones have been downloaded, and manage the download process.

## Features

-   Lists all your 360 photos from Google Street View.
-   Backs up photos to a dedicated folder in your Google Drive.
-   Provides a web interface to view photo status and manage downloads.
-   Allows downloading individual photos.
-   Identifies and helps manage duplicate files in Google Drive.

## Setup

### 1. Google API Credentials

To use this tool, you'll need to set up Google API credentials.

1.  **Go to the [Google Cloud Console](https://console.cloud.google.com/).**
2.  **Create a new project** (or select an existing one).
3.  **Enable the required APIs:**
    -   From the navigation menu, go to **APIs & Services > Library**.
    -   Search for and enable the following APIs:
        -   **Google Drive API**
        -   **Street View Publish API**
4.  **Create OAuth 2.0 Credentials:**
    -   Go to **APIs & Services > Credentials**.
    -   Click **Create Credentials > OAuth client ID**.
    -   Select **Web application** as the application type.
    -   Under **Authorized redirect URIs**, add `http://localhost:3000/oauth2callback`.
    -   Click **Create**.
5.  **Download your credentials:**
    -   After creating the client ID, a dialog will appear with your client ID and secret. Click **Download JSON**.
    -   Rename the downloaded file to `credentials.json` and place it in the root directory of this project.

### 2. Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/sergeychernyshev/360-maps-photo-downloader.git
    cd 360-maps-photo-downloader
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```

### 3. Running the Application

1.  **Start the server:**
    ```bash
    npm start
    ```
2.  **Open your browser** and navigate to `http://localhost:3000`.

## Usage

1.  **Login:** The first time you access the application, you'll be prompted to log in with your Google account. This is required to access your Street View photos and Google Drive.
2.  **Authorize:** You'll be asked to grant permission for the application to access your photos and Drive.
3.  **View Photos:** Once authorized, you'll see a list of your 360 photos, along with their status (Downloaded or Not Downloaded).
4.  **Download Photos:**
    -   To download all missing photos, click the **Download All Missing Photos** button.
    -   To download a single photo, click the **Download** or **Re-download** button next to the photo.
5.  **Manage Duplicates:** If duplicate files are found in your Google Drive folder, you can view and delete them from the web interface.
