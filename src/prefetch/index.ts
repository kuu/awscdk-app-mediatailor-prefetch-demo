import * as crypto from 'crypto';
import {
  MediaTailor,
  CreatePrefetchScheduleCommand,
  CreatePrefetchScheduleResponse,
  DeletePrefetchScheduleCommand,
  DeletePrefetchScheduleResponse,
} from '@aws-sdk/client-mediatailor'; // For MediaTailor SDK
import * as HLS from 'hls-parser'; // For reading/writing the HLS manifest
import fetch from 'node-fetch'; // For making a request to the origin

const client = new MediaTailor({ region: process.env.REGION });
const PLAYBACK_CONFIGURATION_NAME = process.env.PLAYBACK_CONFIGURATION_NAME as string;
const SESSION_INITIALIZATION_URL = process.env.SESSION_INITIALIZATION_URL as string;
const HOST_NAME = process.env.HOST_NAME as string;
const INDEX_OF_RENDITIONS = Number.parseInt(process.env.INDEX_OF_RENDITIONS as string, 10);
const RETRIEVAL_WINDOW_LENGTH_IN_SECONDS = Number.parseInt(process.env.RETRIEVAL_WINDOW_LENGTH_IN_SECONDS as string, 10);
const EVENT_END_TIME = new Date(process.env.EVENT_END_TIME as string);

HLS.setOptions({ silent: true }); // Surpress the error message

export async function handler(event: any) {
  let url = event.url;
  let retrievalWindowEnd = event.retrievalWindowEnd;
  const prefetchList = event.prefetchList;
  const timestamp = new Date().toISOString();

  if (!url) {
    const manifestUrl = await createSession(SESSION_INITIALIZATION_URL, HOST_NAME);
    url = manifestUrl.includes('.m3u8') ? await getRendtionUrl(manifestUrl, INDEX_OF_RENDITIONS) : manifestUrl;
  }

  const manifest = await getPlaylist(url);

  if (!manifest || manifest.isMasterPlaylist) {
    console.error('Failed to fetch the HLS manifest');
    return { url, prefetchList, retrievalWindowEnd, timestamp };
  }

  const mediaPlaylist = manifest as HLS.types.MediaPlaylist;

  if (isLastSegmentWithinAvail(mediaPlaylist)) {
    if (prefetchList.length > 0) {
      // Delete all prefetch schedules
      for (const name of prefetchList) {
        await deletePrefetch(PLAYBACK_CONFIGURATION_NAME, name);
        console.log(`Deleted a prefetch schedule: ${name}`);
      }
    }
    return { url, prefetchList: [], timestamp };
  }
  // The last segment is out of avail
  if (!retrievalWindowEnd || isRetrievalWindowExpiring(mediaPlaylist, new Date(retrievalWindowEnd))) {
    const nextRetrievalWindowStart = retrievalWindowEnd ? new Date(retrievalWindowEnd) : getLiveEdge(mediaPlaylist);
    if (nextRetrievalWindowStart > EVENT_END_TIME
      || new Date(nextRetrievalWindowStart.getTime() + RETRIEVAL_WINDOW_LENGTH_IN_SECONDS * 1000) > EVENT_END_TIME) {
      console.log('The event has ended');
      return { url, prefetchList, retrievalWindowEnd, timestamp };
    }
    const response = await createPrefetch(
      PLAYBACK_CONFIGURATION_NAME,
      nextRetrievalWindowStart,
      new Date(nextRetrievalWindowStart.getTime() + RETRIEVAL_WINDOW_LENGTH_IN_SECONDS * 1000),
      nextRetrievalWindowStart,
      EVENT_END_TIME,
    );
    console.log(`Created a prefetch schedule:\n${JSON.stringify(response, null, 2)}`);
    prefetchList.push(response.Name);
    retrievalWindowEnd = response.Retrieval?.EndTime?.toISOString();
  }
  return { url, prefetchList, retrievalWindowEnd, timestamp };
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

async function getPlaylist(url: string): Promise<HLS.types.Playlist | undefined> {
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`Failed to fetch the HLS manifest: ${res.status} ${res.statusText} - ${url}`);
    return undefined;
  }
  // Parse the HLS manifest
  return HLS.parse(await res.text());
}

async function createPrefetch(
  playbackConfigurationName: string,
  retrievalWindowStart: Date,
  retrievalWindowEnd: Date,
  eventStartTime: Date,
  eventEndTime: Date,
): Promise<CreatePrefetchScheduleResponse> {
  const command = new CreatePrefetchScheduleCommand({
    Name: crypto.randomUUID(),
    PlaybackConfigurationName: playbackConfigurationName,
    Retrieval: {
      DynamicVariables: {
        'session.avail_duration_secs': '60',
      },
      StartTime: retrievalWindowStart,
      EndTime: retrievalWindowEnd,
    },
    Consumption: {
      AvailMatchingCriteria: [
        {
          DynamicVariable: 'session.avail_duration_secs',
          Operator: 'EQUALS',
        },
      ],
      StartTime: eventStartTime,
      EndTime: eventEndTime,
    },
    // StreamId: "STRING_VALUE",
  });
  return client.send(command);
}

async function deletePrefetch(playbackConfigurationName: string, prefetchName: string): Promise<DeletePrefetchScheduleResponse> {
  const command = new DeletePrefetchScheduleCommand({
    Name: prefetchName,
    PlaybackConfigurationName: playbackConfigurationName,
  });
  return client.send(command);
}

function isLastSegmentWithinAvail({ segments }: HLS.types.MediaPlaylist): boolean {
  if (segments.length > 0 && segments[segments.length - 1].uri.startsWith('https://segments.mediatailor.')) {
    return true;
  }
  return false;
}

function isRetrievalWindowExpiring(mediaPlaylist: HLS.types.MediaPlaylist, windowEnd: Date): boolean {
  const liveEdge = getLiveEdge(mediaPlaylist);
  return new Date(liveEdge.getTime() + mediaPlaylist.targetDuration * 1000) > windowEnd;
}

function getLiveEdge( { segments, targetDuration }: HLS.types.MediaPlaylist): Date {
  const nearFuture = new Date(new Date().getTime() + 15 * 1000);
  if (segments.length === 0) {
    return nearFuture;
  }
  const lastSegment = segments[segments.length - 1];
  return lastSegment.programDateTime ? new Date(lastSegment.programDateTime.getTime() + targetDuration * 3 * 1000) : nearFuture;
}