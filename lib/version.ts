import metadata from "../package.json";
export const APP_VERSION=metadata.version;
export const APP_CHANNEL=APP_VERSION.includes("-")?"beta":"stable";
