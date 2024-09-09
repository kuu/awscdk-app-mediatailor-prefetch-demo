import * as HLS from 'hls-parser'; // For reading/writing the HLS manifest
import fetch from 'node-fetch'; // For making a request to the origin
import { getDesiredSessionVolume } from './util';

const SESSION_INITIALIZATION_URL = process.env.SESSION_INITIALIZATION_URL as string;
const HOST_NAME = process.env.HOST_NAME as string;
const INDEX_OF_RENDITIONS = Number.parseInt(process.env.INDEX_OF_RENDITIONS as string, 10);
const SESSION_REQUIREMENTS = JSON.parse(process.env.SESSION_REQUIREMENTS as string);
const EVENT_START_TIME = new Date(process.env.EVENT_START_TIME as string);

HLS.setOptions({ silent: true }); // Surpress the error message

export async function handler(event: any) {
  const urlList = event.urlList;
  const desiredSessionVolume = getDesiredSessionVolume(EVENT_START_TIME, SESSION_REQUIREMENTS.graph);
  console.log(`Desired session volume: ${desiredSessionVolume}`);
  if (urlList.length < desiredSessionVolume) {
    const createNum = desiredSessionVolume - urlList.length;
    for (let i = 0; i < createNum; i++) {
      const manifestUrl = await createSession(SESSION_INITIALIZATION_URL, HOST_NAME);
      const url = manifestUrl.includes('.m3u8') ? await getRendtionUrl(manifestUrl, INDEX_OF_RENDITIONS) : manifestUrl;
      urlList.push(url);
    }
  } else {
    urlList.length = desiredSessionVolume;
  }
  for (const url of urlList) {
    await getManifest(url);
  }
  return { urlList, timestamp: new Date().toISOString() };
}

async function createSession(sessionInitializationUrl: string, hostName: string): Promise<string> {
  const res = await fetch(sessionInitializationUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ logMode: 'DEBUG' }),
  });
  if (!res.ok) {
    console.error(`Failed to create a session: ${res.status} ${res.statusText} - ${sessionInitializationUrl}`);
    return '';
  }
  const { manifestUrl } = await res.json() as { manifestUrl?: string };

  return manifestUrl ? new URL(manifestUrl, hostName ? `https://${hostName}` : sessionInitializationUrl).href : '';
}

async function getRendtionUrl(masterPlaylistUrl: string, index: number): Promise<string | undefined> {
  const playlist = await getPlaylist(masterPlaylistUrl);
  if (!playlist || !playlist.isMasterPlaylist) {
    console.error('Failed to fetch the master playlist');
    return undefined;
  }
  const masterPlaylist = playlist as HLS.types.MasterPlaylist;
  if (masterPlaylist.variants.length === 0) {
    console.error('No variant found in the master playlist');
    return undefined;
  }
  return getAbsoluteUrl(masterPlaylistUrl, masterPlaylist.variants[index].uri);
}

function getAbsoluteUrl(parent: string, current: string): string {
  try {
    const url = new URL(current, parent);
    return url.href;
  } catch (e) {
    console.error(`Failed to parse the URL: ${parent} - ${current}`);
  }
  return current;
}

async function getManifest(url: string): Promise<string | undefined> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch the manifest: ${res.status} ${res.statusText} - ${url}`);
    return undefined;
  }
  return res.text();
}

async function getPlaylist(url: string): Promise<HLS.types.Playlist | undefined> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch the HLS manifest: ${res.status} ${res.statusText} - ${url}`);
    return undefined;
  }
  // Parse the HLS manifest
  return HLS.parse(await res.text());
}
