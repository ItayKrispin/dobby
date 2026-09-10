import { google } from "googleapis";
import { getAuthorizedCalendarClient } from "@/lib/google/auth";

const TIME_ZONE = "Asia/Jerusalem";

export async function getBusyIntervals(date: string) {
  const { auth, calendarId } = await getAuthorizedCalendarClient();
  const calendar = google.calendar({ version: "v3", auth });

  const timeMin = `${date}T00:00:00+03:00`;
  const timeMax = `${date}T23:59:59+03:00`;

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      timeZone: TIME_ZONE,
      items: [{ id: calendarId }],
    },
  });

  const busy = response.data.calendars?.[calendarId]?.busy ?? [];
  return busy
    .filter((item) => item.start && item.end)
    .map((item) => ({
      start: new Date(item.start as string),
      end: new Date(item.end as string),
    }));
}

export async function createCalendarEvent(input: {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
}) {
  const { auth, calendarId } = await getAuthorizedCalendarClient();
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: {
        dateTime: input.start.toISOString(),
        timeZone: TIME_ZONE,
      },
      end: {
        dateTime: input.end.toISOString(),
        timeZone: TIME_ZONE,
      },
    },
  });

  return response.data;
}

export async function deleteCalendarEvent(eventId: string) {
  const { auth, calendarId } = await getAuthorizedCalendarClient();
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({ calendarId, eventId });
}

export async function updateCalendarEvent(input: {
  eventId: string;
  summary?: string;
  description?: string;
  start: Date;
  end: Date;
}) {
  const { auth, calendarId } = await getAuthorizedCalendarClient();
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.patch({
    calendarId,
    eventId: input.eventId,
    requestBody: {
      summary: input.summary,
      description: input.description,
      start: {
        dateTime: input.start.toISOString(),
        timeZone: TIME_ZONE,
      },
      end: {
        dateTime: input.end.toISOString(),
        timeZone: TIME_ZONE,
      },
    },
  });

  return response.data;
}
