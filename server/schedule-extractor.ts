import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export interface ScheduleEntry {
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  location?: string;
  type: "office_hours" | "lecture";
}

export interface ExtractedSchedule {
  instructorName?: string;
  entries: ScheduleEntry[];
}

export async function extractScheduleFromImage(base64Image: string): Promise<ExtractedSchedule> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.2",
    messages: [
      {
        role: "system",
        content: `You are an expert at reading office door signs, syllabi, and schedule postings from photos. Extract office hours and teaching schedule information from the image. Return a JSON object with this exact structure:
{
  "instructorName": "string or null if not visible",
  "entries": [
    {
      "dayOfWeek": "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday",
      "startTime": "HH:MM (24-hour format)",
      "endTime": "HH:MM (24-hour format)",
      "location": "room/building if visible, or null",
      "type": "office_hours or lecture"
    }
  ]
}

Rules:
- Use full day names (Monday, Tuesday, etc.)
- Use 24-hour time format (e.g., 14:00 not 2:00 PM)
- If a schedule spans multiple days with the same time, create separate entries for each day
- If you can't determine the type, default to "office_hours"
- Only return valid JSON, no markdown or explanation`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extract the schedule information from this image. Return only valid JSON.",
          },
          {
            type: "image_url",
            image_url: {
              url: base64Image.startsWith("data:") ? base64Image : `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 2000,
  });

  const content = response.choices[0]?.message?.content || "{}";

  let cleaned = content.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      instructorName: parsed.instructorName || undefined,
      entries: Array.isArray(parsed.entries) ? parsed.entries.map((e: any) => ({
        dayOfWeek: String(e.dayOfWeek || "Monday"),
        startTime: String(e.startTime || "09:00"),
        endTime: String(e.endTime || "10:00"),
        location: e.location || undefined,
        type: e.type === "lecture" ? "lecture" : "office_hours",
      })) : [],
    };
  } catch {
    return { entries: [] };
  }
}
