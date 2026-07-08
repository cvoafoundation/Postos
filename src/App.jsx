import React, { useState, useEffect, useMemo } from "react";
import { supabase, supabaseUrl } from "./supabaseClient";
import {
  Flame,
  Send,
  Camera,
  ArrowLeft,
  Rss,
  Dumbbell,
  ClipboardCheck,
  Trophy,
  Users,
  MessageCircle,
  User,
  Bell,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

// ---------------------------------------------------------------------------
// CONSTANTS / MOCK DATA
// ---------------------------------------------------------------------------

const BRANCH_ICON = {
  ARMY: "\u2B50",
  NAVY: "\u2693",
  "AIR FORCE": "\u2708\uFE0F",
  MARINES: "\uD83E\uDD85",
  "COAST GUARD": "\u2699\uFE0F",
  "SPACE FORCE": "\uD83D\uDE80",
};

const STATUS_STYLES = {
  GREEN: { text: "text-emerald-600", border: "border-emerald-600", bg: "bg-emerald-600", dot: "bg-emerald-600" },
  AMBER: { text: "text-amber-500", border: "border-amber-500", bg: "bg-amber-500", dot: "bg-amber-500" },
  RED: { text: "text-red-600", border: "border-red-600", bg: "bg-red-600", dot: "bg-red-600" },
};

function initials(rank, firstName) {
  const r = rank.replace(".", "").trim()[0];
  const f = firstName.trim()[0];
  return `${r}${f}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// FORMATION SECTORIZATION — numbered by each state's order of admission to
// the Union (Indiana was the 19th state, so Indiana veterans land in
// Formation 19). DC was never admitted as a state, so it gets 51 as a
// practical placeholder, not a real admission number.
// ---------------------------------------------------------------------------

const STATE_TO_FORMATION = {
  Delaware: 1, Pennsylvania: 2, "New Jersey": 3, Georgia: 4, Connecticut: 5,
  Massachusetts: 6, Maryland: 7, "South Carolina": 8, "New Hampshire": 9, Virginia: 10,
  "New York": 11, "North Carolina": 12, "Rhode Island": 13, Vermont: 14, Kentucky: 15,
  Tennessee: 16, Ohio: 17, Louisiana: 18, Indiana: 19, Mississippi: 20,
  Illinois: 21, Alabama: 22, Maine: 23, Missouri: 24, Arkansas: 25,
  Michigan: 26, Florida: 27, Texas: 28, Iowa: 29, Wisconsin: 30,
  California: 31, Minnesota: 32, Oregon: 33, Kansas: 34, "West Virginia": 35,
  Nevada: 36, Nebraska: 37, Colorado: 38, "North Dakota": 39, "South Dakota": 40,
  Montana: 41, Washington: 42, Idaho: 43, Wyoming: 44, Utah: 45,
  Oklahoma: 46, "New Mexico": 47, Arizona: 48, Alaska: 49, Hawaii: 50,
  "District of Columbia": 51,
};
const STATES = Object.keys(STATE_TO_FORMATION).sort();
const SQUAD_CAPACITY = 6;
// VHI is Organization #1. Every table that needs organizational separation
// carries this id (with a matching database-level default), so a second
// organization can exist later without retrofitting every table.
const VHI_ORG_ID = "00000000-0000-0000-0000-000000000001";

const NATO = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel", "India", "Juliett", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa", "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "X-ray", "Yankee", "Zulu"];

function comboLabels() {
  const pairs = [];
  for (let i = 0; i < 13; i++) pairs.push(`${NATO[i]}-${NATO[25 - i]}`);
  return pairs;
}

function nextSquadLabel(existingLabelsInFormation) {
  for (const letter of NATO) if (!existingLabelsInFormation.includes(letter)) return letter;
  for (const combo of comboLabels()) if (!existingLabelsInFormation.includes(combo)) return combo;
  return `${NATO[0]}-${NATO[25]}-${existingLabelsInFormation.length}`;
}

function squadDisplayName(sq) {
  return `Formation ${sq.district} \u00B7 ${sq.label}`;
}

function assignSquad(profile, veterans, squads) {
  const formation = STATE_TO_FORMATION[profile.state] || 51;
  const inFormation = squads.filter((s) => s.district === formation);
  for (const sq of inFormation) {
    const count = veterans.filter((v) => v.squadId === sq.id).length;
    if (count < sq.capacity) {
      return { squad: sq, reason: `Formation ${formation} \u2014 ${sq.label} has open capacity`, isNew: false };
    }
  }
  const label = nextSquadLabel(inFormation.map((s) => s.label));
  const isOverflow = !NATO.includes(label);
  const squad = { id: `${formation}-${label}`, district: formation, label, capacity: SQUAD_CAPACITY };
  return {
    squad,
    reason: isOverflow
      ? `Formation ${formation} filled its single call signs, so a new combined squad (${label}) was opened`
      : `Formation ${formation} is opening its next squad (${label})`,
    isNew: true,
  };
}

// Same assignment logic as assignSquad(), but reading real capacity from
// Supabase instead of local mock arrays — used for real signups and for
// reassigning someone who moves to a new state.
async function assignSquadLive(profile) {
  const formation = STATE_TO_FORMATION[profile.state] || 51;
  const { data: formationSquads, error } = await supabase.from("squads").select("*").eq("district", formation).eq("organization_id", VHI_ORG_ID);
  if (error) throw error;
  const squadsList = formationSquads || [];
  for (const sq of squadsList) {
    const { data: memberCount } = await supabase.rpc("count_squad_members", { p_squad_id: sq.id });
    if ((memberCount || 0) < sq.capacity) {
      return { squad: sq, reason: `Formation ${formation} \u2014 ${sq.label} has open capacity`, isNew: false };
    }
  }
  const label = nextSquadLabel(squadsList.map((s) => s.label));
  const isOverflow = !NATO.includes(label);
  const squad = { id: `${formation}-${label}`, district: formation, label, capacity: SQUAD_CAPACITY, organization_id: VHI_ORG_ID };
  const { error: insertErr } = await supabase.from("squads").insert(squad);
  if (insertErr) throw insertErr;
  return {
    squad,
    reason: isOverflow
      ? `Formation ${formation} filled its single call signs, so a new combined squad (${label}) was opened`
      : `Formation ${formation} is opening its next squad (${label})`,
    isNew: true,
  };
}

// Finishes creating a profile using details stashed as account metadata at
// signup — used when a login only just now became "real" (email just
// confirmed) and the profile write that requires an active session couldn't
// happen until this moment.
async function completeProfileFromMetadata(userId, meta) {
  const result = await assignSquadLive({ state: meta.state || "Georgia" });
  const weight = Number(meta.weight) || 0;
  const goal = Number(meta.goal_weight) || 0;
  const { error: insertError } = await supabase.from("profiles").insert({
    id: userId,
    first_name: meta.first_name || "Veteran",
    last_name: meta.last_name || "",
    rank: meta.rank || "Pvt.",
    branch: meta.branch || "ARMY",
    military_status: meta.military_status || "Veteran",
    state: meta.state || "Georgia",
    phone: meta.phone || null,
    squad_id: result.squad.id,
    status: "AMBER",
    streak: 0,
    workouts_this_week: 0,
    note: "New member \u2014 first check-in pending",
    joined: new Date().toISOString().slice(0, 10),
    weight_start: weight,
    weight_current: weight,
    goal_weight: goal,
    weeks_since_join: 0,
    checkins_completed: 0,
    connection_improved: false,
    grace_available: true,
    organization_id: VHI_ORG_ID,
    grace_reset_at: new Date().toISOString().slice(0, 10),
  });
  if (insertError) throw insertError;
  const { data: freshRow, error: refetchError } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (refetchError) throw refetchError;
  return freshRow;
}

// Converts a `profiles` table row (snake_case, from Supabase) into the
// camelCase shape every component in this app already expects.
function profileRowToVeteran(row) {
  return {
    id: row.id,
    rank: row.rank,
    firstName: row.first_name,
    lastName: row.last_name,
    branch: row.branch,
    militaryStatus: row.military_status || "Veteran",
    mos: row.mos || undefined,
    photoUrl: row.avatar_url || undefined,
    phone: row.phone || undefined,
    state: row.state,
    squadId: row.squad_id,
    status: row.status,
    streak: row.streak,
    workoutsThisWeek: row.workouts_this_week,
    note: row.note,
    joined: row.joined,
    weightStart: row.weight_start,
    weightCurrent: row.weight_current,
    goalWeight: row.goal_weight,
    weeksSinceJoin: row.weeks_since_join,
    checkinsCompleted: row.checkins_completed,
    connectionImproved: row.connection_improved,
    graceAvailable: row.grace_available === undefined ? true : row.grace_available,
    graceResetAt: row.grace_reset_at || new Date().toISOString().slice(0, 10),
    challengeReps: row.challenge_reps || 0,
    isAdmin: row.is_admin || false,
  };
}

const INITIAL_SQUADS = [
  { id: "4-Alpha", district: 4, label: "Alpha", capacity: SQUAD_CAPACITY },
  { id: "24-Alpha", district: 24, label: "Alpha", capacity: SQUAD_CAPACITY },
];

const INITIAL_VETERANS = [
  {
    id: "webb", rank: "SGT", firstName: "Marcus", lastName: "Webb", branch: "ARMY", mos: "11B",
    state: "Georgia", squadId: "4-Alpha", status: "GREEN", streak: 8, workoutsThisWeek: 3,
    note: "All requirements met", joined: "2024-01-15",
    weightStart: 238, weightCurrent: 218, weeksSinceJoin: 8, checkinsCompleted: 8, connectionImproved: true,
  },
  {
    id: "caldwell", rank: "PO2", firstName: "Erin", lastName: "Caldwell", branch: "NAVY",
    state: "Georgia", squadId: "4-Alpha", status: "GREEN", streak: 12, workoutsThisWeek: 4,
    note: "All requirements met", joined: "2023-11-02",
    weightStart: 210, weightCurrent: 189, weeksSinceJoin: 12, checkinsCompleted: 12, connectionImproved: true,
  },
  {
    id: "rivera", rank: "Cpl.", firstName: "Dante", lastName: "Rivera", branch: "MARINES",
    state: "Georgia", squadId: "4-Alpha", status: "RED", streak: 4, workoutsThisWeek: 1,
    note: "Missed check-in", joined: "2024-03-20",
    weightStart: 205, weightCurrent: 202, weeksSinceJoin: 6, checkinsCompleted: 4, connectionImproved: false,
  },
  {
    id: "nair", rank: "A1C", firstName: "Priya", lastName: "Nair", branch: "AIR FORCE",
    state: "Missouri", squadId: "24-Alpha", status: "AMBER", streak: 9, workoutsThisWeek: 1,
    note: "Workouts below minimum", joined: "2024-01-29",
    weightStart: 190, weightCurrent: 182, weeksSinceJoin: 9, checkinsCompleted: 9, connectionImproved: true,
  },
  {
    id: "okafor", rank: "BM3", firstName: "James", lastName: "Okafor", branch: "COAST GUARD",
    state: "Missouri", squadId: "24-Alpha", status: "RED", streak: 2, workoutsThisWeek: 0,
    note: "Missed check-in", joined: "2024-04-08",
    weightStart: 230, weightCurrent: 225, weeksSinceJoin: 5, checkinsCompleted: 2, connectionImproved: false,
  },
  {
    id: "simmons", rank: "Spc.", firstName: "Tara", lastName: "Simmons", branch: "ARMY",
    state: "Missouri", squadId: "24-Alpha", status: "AMBER", streak: 6, workoutsThisWeek: 1,
    note: "Workouts below minimum", joined: "2024-02-11",
    weightStart: 175, weightCurrent: 168, weeksSinceJoin: 7, checkinsCompleted: 6, connectionImproved: true,
  },
];

const DEFAULT_WEIGHT_HISTORY = {
  webb: [
    { date: "Jan 14", weight: 238 }, { date: "Jan 31", weight: 230 }, { date: "Feb 14", weight: 225 },
    { date: "Feb 29", weight: 222 }, { date: "Mar 14", weight: 218 },
  ],
};
const DEFAULT_GOAL_WEIGHT = { webb: 195 };

const VOLUME_HISTORY = [
  { date: "6/2", volume: 31.6 }, { date: "6/9", volume: 27.4 }, { date: "6/16", volume: 23.1 },
  { date: "6/23", volume: 18.5 }, { date: "6/30", volume: 14.8 },
];

const MUSCLE_BASE = { CHEST: 1, BACK: 1, SHOULDERS: 1, BICEPS: 1, TRICEPS: 1, QUADS: 1, HAMSTRINGS: 1, GLUTES: 1, CALVES: 0, CORE: 0 };
const MUSCLE_ZERO = { CHEST: 0, BACK: 0, SHOULDERS: 0, BICEPS: 0, TRICEPS: 0, QUADS: 0, HAMSTRINGS: 0, GLUTES: 0, CALVES: 0, CORE: 0 };

// Specialized, per-muscle-group exercise libraries (20+ each) so someone
// chasing a specific body part has real depth to log against, not just the
// handful of exercises in the general templates below.
const MUSCLE_GROUP_EXERCISES = {
  CHEST: [
    "Barbell Bench Press", "Incline Barbell Bench Press", "Decline Barbell Bench Press", "Dumbbell Bench Press",
    "Incline Dumbbell Press", "Decline Dumbbell Press", "Dumbbell Flyes", "Incline Dumbbell Flyes",
    "Cable Crossover", "Low-to-High Cable Fly", "High-to-Low Cable Fly", "Pec Deck Machine",
    "Machine Chest Press", "Push-Ups", "Incline Push-Ups", "Decline Push-Ups",
    "Diamond Push-Ups", "Dips (Chest Lean)", "Landmine Press", "Svend Press", "Guillotine Press",
  ],
  BACK: [
    "Deadlift", "Pull-Ups", "Chin-Ups", "Lat Pulldown", "Close-Grip Lat Pulldown", "Bent-Over Barbell Row",
    "Pendlay Row", "T-Bar Row", "Single-Arm Dumbbell Row", "Seated Cable Row", "Chest-Supported Row",
    "Straight-Arm Pulldown", "Rack Pull", "Good Morning", "Face Pull", "Inverted Row", "Renegade Row",
    "Meadows Row", "Kroc Row", "Superman Hold", "Back Extension",
  ],
  SHOULDERS: [
    "Overhead Barbell Press", "Seated Dumbbell Press", "Arnold Press", "Push Press", "Behind-the-Neck Press",
    "Lateral Raise", "Cable Lateral Raise", "Front Raise", "Plate Front Raise", "Rear Delt Fly",
    "Reverse Pec Deck", "Face Pull (Delt Focus)", "Upright Row", "Cuban Press", "Landmine Press (Shoulder)",
    "Bradford Press", "Machine Shoulder Press", "Cable Y-Raise", "Handstand Push-Up", "Bus Driver",
    "Scott Press",
  ],
  BICEPS: [
    "Barbell Curl", "EZ-Bar Curl", "Dumbbell Curl", "Alternating Dumbbell Curl", "Hammer Curl",
    "Cross-Body Hammer Curl", "Preacher Curl", "Machine Preacher Curl", "Concentration Curl",
    "Cable Curl", "Cable Rope Curl", "Incline Dumbbell Curl", "Spider Curl", "21s",
    "Zottman Curl", "Reverse Curl", "Drag Curl", "Chin-Up (Bicep Focus)", "Waiter Curl",
    "Cheat Curl", "Bayesian Cable Curl",
  ],
  TRICEPS: [
    "Close-Grip Bench Press", "Triceps Pushdown", "Rope Pushdown", "Overhead Triceps Extension",
    "Dumbbell Skull Crusher", "EZ-Bar Skull Crusher", "Overhead Cable Extension", "Single-Arm Overhead Extension",
    "Dips (Triceps Focus)", "Bench Dips", "Diamond Push-Ups (Triceps)", "Kickback", "Cable Kickback",
    "JM Press", "Tate Press", "Machine Triceps Extension", "Reverse-Grip Pushdown", "Floor Press",
    "One-Arm Pushdown", "Triceps Press-Down (Bar)", "French Press",
  ],
  QUADS: [
    "Back Squat", "Front Squat", "Goblet Squat", "Leg Press", "Hack Squat", "Bulgarian Split Squat",
    "Walking Lunges", "Reverse Lunges", "Step-Ups", "Leg Extension", "Sissy Squat", "Zercher Squat",
    "Box Squat", "Landmine Squat", "Cyclist Squat", "Smith Machine Squat", "Pistol Squat",
    "Wall Sit", "Belt Squat", "Overhead Squat",
  ],
  HAMSTRINGS: [
    "Romanian Deadlift", "Stiff-Leg Deadlift", "Lying Leg Curl", "Seated Leg Curl", "Standing Leg Curl",
    "Good Morning (Hamstring Focus)", "Glute-Ham Raise", "Nordic Curl", "Single-Leg RDL",
    "Cable Pull-Through", "Kettlebell Swing", "Sumo Deadlift", "Deficit Deadlift", "Swiss Ball Leg Curl",
    "Reverse Hyperextension", "Trap Bar Deadlift", "Banded Leg Curl", "Slider Leg Curl",
    "Snatch-Grip Deadlift", "Single-Leg Hip Thrust (Hamstring)",
  ],
  GLUTES: [
    "Hip Thrust", "Barbell Glute Bridge", "Single-Leg Hip Thrust", "Cable Kickback", "Bulgarian Split Squat (Glute Focus)",
    "Sumo Squat", "Curtsy Lunge", "Banded Lateral Walk", "Clamshell", "Fire Hydrant", "Step-Up (Glute Focus)",
    "Cable Pull-Through (Glute Focus)", "Frog Pump", "Donkey Kick", "Reverse Lunge (Glute Focus)", "B-Stance Hip Thrust",
    "Glute Bridge March", "Deadlift (Glute Focus)", "Landmine Hip Thrust", "Smith Machine Hip Thrust",
  ],
  CALVES: [
    "Standing Calf Raise", "Seated Calf Raise", "Leg Press Calf Raise", "Donkey Calf Raise",
    "Single-Leg Calf Raise", "Smith Machine Calf Raise", "Calf Press on Leg Press", "Jump Rope",
    "Farmer's Walk on Toes", "Barbell Calf Raise", "Dumbbell Calf Raise", "Box Jumps (Calf Focus)",
    "Tibia Raise", "Poliquin Step-Up", "Standing Calf Raise Machine", "Explosive Calf Hop",
    "Sled Push (Calf Focus)", "Stair Calf Raise", "Banded Calf Raise", "Eccentric Calf Raise",
  ],
  CORE: [
    "Plank", "Side Plank", "Hanging Leg Raise", "Hanging Knee Raise", "Cable Crunch", "Sit-Up",
    "Weighted Sit-Up", "Russian Twist", "Ab Wheel Rollout", "Bicycle Crunch", "Mountain Climbers",
    "Toes to Bar", "V-Up", "Flutter Kicks", "Dead Bug", "Pallof Press", "Woodchopper",
    "Dragon Flag", "Reverse Crunch", "Stability Ball Crunch", "L-Sit",
  ],
};
const MUSCLE_GROUP_ORDER = ["CHEST", "BACK", "SHOULDERS", "BICEPS", "TRICEPS", "QUADS", "HAMSTRINGS", "GLUTES", "CALVES", "CORE"];

const WORKOUT_TEMPLATES = [
  { id: "upper", name: "Upper Body", exercises: ["Bench Press", "Bent-Over Row", "Overhead Press", "Pull-Ups", "Tricep Pushdowns", "Bicep Curls"] },
  { id: "lower", name: "Lower Body", exercises: ["Back Squat", "Romanian Deadlift", "Leg Press", "Walking Lunges", "Calf Raises"] },
  { id: "full", name: "Full Body", exercises: ["Deadlift", "Push-Ups", "Goblet Squat", "Dumbbell Row", "Plank"] },
  { id: "cardio", name: "Cardio / PT", exercises: ["Run (miles)", "Burpees", "Box Jumps", "Battle Ropes", "Sled Push (yards)"] },
];

const EXERCISE_MUSCLES = {
  "Bench Press": ["CHEST", "TRICEPS", "SHOULDERS"],
  "Bent-Over Row": ["BACK", "BICEPS"],
  "Overhead Press": ["SHOULDERS", "TRICEPS"],
  "Pull-Ups": ["BACK", "BICEPS"],
  "Tricep Pushdowns": ["TRICEPS"],
  "Bicep Curls": ["BICEPS"],
  "Back Squat": ["QUADS", "GLUTES", "HAMSTRINGS"],
  "Romanian Deadlift": ["HAMSTRINGS", "GLUTES"],
  "Leg Press": ["QUADS", "GLUTES"],
  "Walking Lunges": ["QUADS", "GLUTES"],
  "Calf Raises": ["CALVES"],
  Deadlift: ["BACK", "HAMSTRINGS", "GLUTES"],
  "Push-Ups": ["CHEST", "TRICEPS", "SHOULDERS"],
  "Goblet Squat": ["QUADS", "GLUTES"],
  "Dumbbell Row": ["BACK", "BICEPS"],
  Plank: ["CORE"],
  Burpees: ["CORE"],
  "Box Jumps": ["QUADS", "GLUTES"],
  "Battle Ropes": ["SHOULDERS", "CORE"],
  "Sled Push (yards)": ["QUADS", "GLUTES"],
};

const WEEKLY_PLAN = [
  { day: "Monday", templateId: "upper" },
  { day: "Tuesday", templateId: "cardio" },
  { day: "Wednesday", templateId: null },
  { day: "Thursday", templateId: "lower" },
  { day: "Friday", templateId: "full" },
  { day: "Saturday", templateId: "cardio" },
  { day: "Sunday", templateId: null },
];

const INITIAL_EXERCISE_LOG = {
  "bench press": [{ date: "6/16", weight: 205, reps: 8, sets: 3 }],
  "back squat": [{ date: "6/16", weight: 275, reps: 5, sets: 5 }],
  deadlift: [{ date: "6/9", weight: 315, reps: 5, sets: 3 }],
  "pull-ups": [{ date: "6/16", weight: 0, reps: 10, sets: 3 }],
};

const INITIAL_WORKOUT_SESSIONS = [
  {
    id: "seed-1", date: "6/16", label: "Monday \u2014 Upper Body",
    exercises: [
      { name: "Bench Press", weight: 205, reps: 8, sets: 3 },
      { name: "Pull-Ups", weight: 0, reps: 10, sets: 3 },
    ],
  },
  {
    id: "seed-2", date: "6/16", label: "Back Squat (Custom)",
    exercises: [{ name: "Back Squat", weight: 275, reps: 5, sets: 5 }],
  },
  {
    id: "seed-3", date: "6/9", label: "Full Body",
    exercises: [{ name: "Deadlift", weight: 315, reps: 5, sets: 3 }],
  },
];

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function timeAgo(isoString) {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function postRowToPost(row) {
  return {
    id: row.id,
    scope: row.scope,
    squadId: row.squad_id,
    authorId: row.author_id,
    author: row.author_name,
    branch: row.author_branch,
    time: timeAgo(row.created_at),
    text: row.text,
    fists: row.fists,
    comments: row.comments || [],
  };
}

function groupSessionsByDate(sessions) {
  const map = new Map();
  sessions.forEach((s) => {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  });
  return Array.from(map.entries());
}

function getLastLog(exerciseLog, name) {
  const key = name.trim().toLowerCase();
  const arr = exerciseLog[key];
  if (!arr || !arr.length) return null;
  return arr[arr.length - 1];
}

const BASE_CHALLENGE = { title: "100 Pull-Ups", description: "Any grip. Any time. Log your sets.", total: 6, completed: 4, userReps: 0 };

const INITIAL_POSTS = [
  { id: 1, scope: "battalion", squadId: "4-Alpha", authorId: "caldwell", author: "PO2 Erin Caldwell", branch: "NAVY", time: "2h ago", text: "Hit a new deadlift PR today \u2014 225 lbs. Keep showing up.", fists: 14, comments: [{ authorId: "webb", author: "SGT Marcus Webb", text: "Let's go, Caldwell!", time: "1h ago", stars: 2 }] },
  { id: 2, scope: "squad", squadId: "4-Alpha", authorId: "webb", author: "SGT Marcus Webb", branch: "ARMY", time: "1d ago", text: "AAR's done. Sustain: sleep. Improve: hydration. Who's in for Saturday PT?", fists: 5, comments: [{ authorId: "caldwell", author: "PO2 Erin Caldwell", text: "In. 0800?", time: "20h ago", stars: 0 }, { authorId: "rivera", author: "Cpl. Dante Rivera", text: "Count me in too.", time: "18h ago", stars: 1 }] },
];

const INITIAL_THREADS = {
  caldwell: {
    contact: "PO2 Erin Caldwell", branch: "NAVY", status: "GREEN", unread: true,
    messages: [
      { from: "them", text: "Good work this week, Webb.", time: "Mon 0800" },
      { from: "me", text: "Appreciate it. Keeping the streak alive.", time: "Mon 0810" },
    ],
  },
  rivera: { contact: "Cpl. Dante Rivera", branch: "MARINES", status: "RED", unread: false, messages: [{ from: "me", text: "Rivera \u2014 you good? Missed check-in this week.", time: "Wed 1200" }] },
};

// ---------------------------------------------------------------------------
// METRICS (data model for the future admin dashboard)
// ---------------------------------------------------------------------------

function computeCohortMetrics(veterans, squads) {
  const total = veterans.length || 1;
  const totalCheckins = veterans.reduce((s, v) => s + v.checkinsCompleted, 0);
  const avgWeightLost = veterans.reduce((s, v) => s + (v.weightStart - v.weightCurrent), 0) / total;
  const pctCompleting = (veterans.reduce((s, v) => s + (v.weeksSinceJoin ? v.checkinsCompleted / v.weeksSinceJoin : 0), 0) / total) * 100;
  const missed = veterans.reduce((s, v) => s + Math.max(0, v.weeksSinceJoin - v.checkinsCompleted), 0);
  const pctConnection = (veterans.filter((v) => v.connectionImproved).length / total) * 100;
  const statusCounts = { GREEN: 0, AMBER: 0, RED: 0 };
  veterans.forEach((v) => statusCounts[v.status]++);
  const squadEngagement = squads.map((sq) => {
    const members = veterans.filter((v) => v.squadId === sq.id);
    const denom = members.reduce((s, v) => s + v.weeksSinceJoin, 0) || 1;
    const num = members.reduce((s, v) => s + v.checkinsCompleted, 0);
    return { squad: squadDisplayName(sq), rate: Math.round((num / denom) * 100), members: members.length };
  });
  return {
    totalEnrolled: total, totalCheckins, avgWeightLost: Math.round(avgWeightLost * 10) / 10,
    pctCompleting: Math.round(pctCompleting), missed, pctConnection: Math.round(pctConnection),
    statusCounts, squadEngagement,
  };
}

const ORG_WIDE_SAMPLE = {
  totalEnrolled: 1247, totalCheckins: 38412, avgWeightLost: 9, retention30: 92, retention90: 84, retention180: 71,
  pctCompleting: 78, pctConnection: 91, squadEngagement: 86, missed: 214, statusCounts: { GREEN: 812, AMBER: 298, RED: 137 },
};

// ---------------------------------------------------------------------------
// SHARED UI
// ---------------------------------------------------------------------------

function StatusBadge({ status, size = "sm" }) {
  const s = STATUS_STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 font-display tracking-widest border rounded px-2 py-1 ${s.border} ${s.text} ${size === "lg" ? "text-sm" : "text-xs"}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

const BRANCH_STYLE = {
  ARMY: { bg: "#4B5320", color: "#FFFFFF" }, // Army green
  MARINES: { bg: "#8B0000", color: "#FFFFFF" }, // Marine red
  NAVY: { bg: "#002F6C", color: "#FFFFFF" }, // Navy blue
  "AIR FORCE": { bg: "#5D8AA8", color: "#FFFFFF" }, // Air Force blue
  "COAST GUARD": { bg: "#F5C518", color: "#000000" }, // Coast Guard yellow
  "SPACE FORCE": { bg: "#000000", color: "#FFFFFF", border: "1px solid #4B5563" }, // Space Force black
};

function BranchBadge({ branch }) {
  const style = BRANCH_STYLE[branch] || { bg: "#000000", color: "#FFFFFF" };
  return (
    <span
      className="inline-flex items-center gap-1.5 font-display tracking-widest text-xs px-2 py-1 rounded"
      style={{ backgroundColor: style.bg, color: style.color, border: style.border }}
    >
      <span>{BRANCH_ICON[branch]}</span> {branch}
    </span>
  );
}

function Avatar({ rank, firstName, size = 44, photoUrl }) {
  if (photoUrl) {
    return <img src={photoUrl} alt="" className="rounded shrink-0 object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="bg-black text-white font-display flex items-center justify-center rounded shrink-0" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials(rank, firstName)}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="font-display text-xs tracking-widest text-gray-400 mb-3">{children}</div>;
}

function WeightChart({ data, goal }) {
  return (
    <div className="h-40">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#E5E5E5" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tick={{ fontFamily: "Archivo", fontSize: 11, fill: "#999" }} axisLine={{ stroke: "#000" }} tickLine={false} />
          <YAxis tick={{ fontFamily: "Archivo", fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} domain={["dataMin - 8", "dataMax + 4"]} width={40} />
          <Tooltip contentStyle={{ border: "2px solid black", borderRadius: 6, fontFamily: "Archivo", fontSize: 12 }} />
          {goal && <ReferenceLine y={goal} stroke="#000" strokeDasharray="4 4" />}
          <Line type="monotone" dataKey="weight" stroke="#000" strokeWidth={2.5} dot={{ r: 4, fill: "#000" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ONBOARDING (signup + district/squad assignment)
// ---------------------------------------------------------------------------

const GOALS = ["Weight Loss", "Strength & Mobility", "General Fitness", "Cardio Endurance"];
const BRANCHES = ["ARMY", "NAVY", "AIR FORCE", "MARINES", "COAST GUARD", "SPACE FORCE"];
const MILITARY_STATUSES = ["Veteran", "Retired", "Active Duty", "National Guard", "Reserve"];

function Onboarding({ onDemo, onJoin, onLogin }) {
  const [step, setStep] = useState("start");
  const [profile, setProfile] = useState({ firstName: "", lastName: "", email: "", password: "", confirmPassword: "", phone: "", rank: "", militaryStatus: "Veteran", branch: "ARMY", state: "Georgia", goal: "Weight Loss", weight: "", goalWeight: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [placement, setPlacement] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyProvider, setVerifyProvider] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [createdUserId, setCreatedUserId] = useState(null);

  const canSubmit = profile.firstName && profile.lastName && profile.email && profile.password && profile.password === profile.confirmPassword && profile.phone && profile.weight && profile.goalWeight;
  const passwordsMismatch = profile.password && profile.confirmPassword && profile.password !== profile.confirmPassword;
  const canLogin = loginForm.email && loginForm.password;

  function handleVerify(provider) {
    setVerifyProvider(provider);
    setVerifying(true);
    // DEMO ONLY: real integration redirects to the provider's hosted verification
    // flow and waits for a server-side verified/not-verified callback — it does
    // not resolve locally like this.
    setTimeout(() => {
      setVerifying(false);
      setVerified(true);
    }, 1400);
  }

  async function handleCreateAccount() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: profile.email.trim(),
        password: profile.password,
        options: {
          data: {
            first_name: profile.firstName,
            last_name: profile.lastName,
            rank: profile.rank.trim() || "Pvt.",
            branch: profile.branch,
            military_status: profile.militaryStatus,
            state: profile.state,
            phone: profile.phone,
            weight: profile.weight,
            goal_weight: profile.goalWeight,
          },
        },
      });
      if (signUpError) throw signUpError;
      const userId = signUpData.user?.id;
      if (!userId) {
        throw new Error("Check your email to confirm your account, then come back and log in.");
      }
      if (!signUpData.session) {
        // No active session yet, which means the profile can't be written
        // (the database requires you to be logged in as yourself to create
        // your own profile row). We saved your details above as account
        // metadata — the first Log In after confirming finishes the job.
        throw new Error(
          "Account created! Check your email to confirm your address, then come back and Log In \u2014 we'll finish setting up your squad at that point."
        );
      }

      const result = await assignSquadLive(profile);
      const weight = Number(profile.weight);
      const goal = Number(profile.goalWeight);

      const { error: insertError } = await supabase.from("profiles").insert({
        id: userId,
        first_name: profile.firstName,
        last_name: profile.lastName,
        rank: profile.rank.trim() || "Pvt.",
        branch: profile.branch,
        military_status: profile.militaryStatus,
        state: profile.state,
        phone: profile.phone,
        squad_id: result.squad.id,
        status: "AMBER",
        streak: 0,
        workouts_this_week: 0,
        note: "New member \u2014 first check-in pending",
        joined: new Date().toISOString().slice(0, 10),
        weight_start: weight,
        weight_current: weight,
        goal_weight: goal,
        weeks_since_join: 0,
        checkins_completed: 0,
        connection_improved: false,
        grace_available: true,
        organization_id: VHI_ORG_ID,
        grace_reset_at: new Date().toISOString().slice(0, 10),
      });
      if (insertError) throw insertError;

      setPlacement(result);
      setCreatedUserId(userId);
      setStep("placed");
    } catch (err) {
      setAuthError(err.message || String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    setAuthError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) setAuthError(error.message);
    // On success, the browser navigates away to Google and back — the app's
    // session-restore logic (on load) picks up from there.
  }

  async function handleLogin() {
    setAuthError(null);
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: loginForm.email.trim(), password: loginForm.password });
      if (error) throw error;
      let { data: profileRow, error: profileError } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      if (profileError) throw profileError;

      if (!profileRow) {
        // First login after confirming email — the profile was never
        // written at signup (no session existed yet to write it under),
        // so finish it now using the details we stashed as account metadata.
        profileRow = await completeProfileFromMetadata(data.user.id, data.user.user_metadata || {});
      }

      const { data: squadRow } = await supabase.from("squads").select("*").eq("id", profileRow.squad_id).single();
      onLogin(profileRowToVeteran(profileRow), squadRow);
    } catch (err) {
      setAuthError(err.message || String(err));
    } finally {
      setAuthLoading(false);
    }
  }

  if (step === "login") {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 bg-white">
        <div className="font-display text-3xl mb-1">LOG IN</div>
        <p className="font-body text-sm text-gray-500 mb-6">Welcome back. Your squad's been waiting on your check-in.</p>
        <div className="space-y-4 mb-4">
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">EMAIL</span>
            <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">PASSWORD</span>
            <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
        </div>
        {authError && <div className="font-body text-sm text-red-600 mb-4">{authError}</div>}
        <button disabled={!canLogin || authLoading} onClick={handleLogin} className={`w-full font-display tracking-widest text-sm py-4 rounded-lg mb-3 ${canLogin ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
          {authLoading ? "LOGGING IN\u2026" : "LOG IN"}
        </button>
        <button onClick={() => setStep("start")} className="w-full border border-black font-display tracking-widest text-sm py-4 rounded-lg">BACK</button>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="min-h-screen px-6 py-10 bg-white flex flex-col justify-center">
        <div className="font-display text-3xl mb-1">VERIFY YOUR SERVICE</div>
        <p className="font-body text-sm text-gray-500 mb-6">
          VHI confirms veteran status through a trusted third-party verifier &mdash; the same kind of service Lowe's and other military-discount programs use. You never upload a DD-214 or ID to us directly.
        </p>
        <div className="border-2 border-black rounded-lg p-6 mb-4">
          {!verifying && !verified && (
            <>
              <div className="font-body font-semibold mb-3 text-center">Choose a verification provider</div>
              <button onClick={() => handleVerify("ID.me")} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg mb-3">
                VERIFY WITH ID.ME
              </button>
              <button onClick={() => handleVerify("SheerID")} className="w-full border border-black font-display tracking-widest text-sm py-4 rounded-lg">
                VERIFY WITH SHEERID
              </button>
            </>
          )}
          {verifying && (
            <div className="text-center py-6">
              <div className="font-display text-sm tracking-widest text-gray-400 mb-2">CONNECTING TO {verifyProvider ? verifyProvider.toUpperCase() : ""}&hellip;</div>
              <div className="font-body text-xs text-gray-400">In production, you'd be redirected to {verifyProvider}'s site to confirm your status.</div>
            </div>
          )}
          {verified && (
            <div className="text-center py-4">
              <StatusBadge status="GREEN" size="lg" />
              <div className="font-display text-2xl mt-3">SERVICE VERIFIED</div>
              <div className="font-body text-xs text-gray-400 mt-1">Confirmed via {verifyProvider}</div>
            </div>
          )}
        </div>
        {authError && <div className="font-body text-sm text-red-600 mb-4">{authError}</div>}
        {verified && (
          <button disabled={authLoading} onClick={handleCreateAccount} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg">
            {authLoading ? "CREATING ACCOUNT\u2026" : "FIND MY SQUAD"}
          </button>
        )}
        <p className="font-body text-xs text-gray-400 text-center mt-4">
          The verification step above is a demo mock. The account and squad placement that happen next are real &mdash; they're written to your live database.
        </p>
      </div>
    );
  }

  if (step === "placed" && placement) {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 bg-white">
        <div className="bg-black text-white rounded-lg p-6 text-center">
          <div className="font-display text-xs tracking-widest text-gray-400 mb-2">YOU'VE BEEN PLACED</div>
          <div className="font-display text-4xl mb-3">{squadDisplayName(placement.squad)}</div>
          <p className="font-body text-gray-300 text-sm">{placement.reason}. Your squad holds you accountable &mdash; and you hold them.</p>
        </div>
        <button
          onClick={() => {
            const weight = Number(profile.weight);
            const goal = Number(profile.goalWeight);
            const veteranObj = {
              id: createdUserId, rank: profile.rank.trim() || "Pvt.", firstName: profile.firstName, lastName: profile.lastName,
              branch: profile.branch, militaryStatus: profile.militaryStatus, state: profile.state, squadId: placement.squad.id, status: "AMBER",
              streak: 0, workoutsThisWeek: 0, note: "New member \u2014 first check-in pending",
              joined: new Date().toISOString().slice(0, 10), weightStart: weight, weightCurrent: weight,
              goalWeight: goal, weeksSinceJoin: 0, checkinsCompleted: 0, connectionImproved: false,
              graceAvailable: true, graceResetAt: new Date().toISOString().slice(0, 10),
            };
            onJoin(veteranObj, placement.squad);
          }}
          className="mt-6 w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg"
        >
          ENTER VHI
        </button>
      </div>
    );
  }

  if (step === "form") {
    return (
      <div className="min-h-screen px-6 py-10 bg-white">
        <div className="font-display text-3xl mb-1">JOIN VHI</div>
        <p className="font-body text-sm text-gray-500 mb-6">Squads are sectorized into Formations numbered by your state's order of admission to the Union &mdash; Indiana is Formation 19, for example. You fill in sequentially. No picking your squad.</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-display text-xs tracking-widest text-gray-400">FIRST NAME</span>
              <input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            </label>
            <label className="block">
              <span className="font-display text-xs tracking-widest text-gray-400">LAST NAME</span>
              <input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            </label>
          </div>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">EMAIL</span>
            <input type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">PASSWORD</span>
            <input type="password" value={profile.password} onChange={(e) => setProfile({ ...profile, password: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            <span className="font-body text-xs text-gray-400">At least 6 characters.</span>
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">CONFIRM PASSWORD</span>
            <input type="password" value={profile.confirmPassword} onChange={(e) => setProfile({ ...profile, confirmPassword: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            {passwordsMismatch && <span className="font-body text-xs text-red-600">Passwords don't match.</span>}
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">PHONE NUMBER</span>
            <input type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 555-5555" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">BRANCH</span>
            <select value={profile.branch} onChange={(e) => setProfile({ ...profile, branch: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
              {BRANCHES.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-display text-xs tracking-widest text-gray-400">RANK</span>
              <input value={profile.rank} onChange={(e) => setProfile({ ...profile, rank: e.target.value })} placeholder="e.g. SGT, Cpl., PO2" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            </label>
            <label className="block">
              <span className="font-display text-xs tracking-widest text-gray-400">STATUS</span>
              <select value={profile.militaryStatus} onChange={(e) => setProfile({ ...profile, militaryStatus: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
                {MILITARY_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">HOME STATE</span>
            <select value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
              {STATES.map((s) => <option key={s}>{s}</option>)}
            </select>
            <span className="font-body text-xs text-gray-400">This sets your formation: Formation {STATE_TO_FORMATION[profile.state]}</span>
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">PRIMARY GOAL</span>
            <select value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
              {GOALS.map((g) => <option key={g}>{g}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-display text-xs tracking-widest text-gray-400">CURRENT WEIGHT (LBS)</span>
              <input type="number" value={profile.weight} onChange={(e) => setProfile({ ...profile, weight: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            </label>
            <label className="block">
              <span className="font-display text-xs tracking-widest text-gray-400">GOAL WEIGHT (LBS)</span>
              <input type="number" value={profile.goalWeight} onChange={(e) => setProfile({ ...profile, goalWeight: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
            </label>
          </div>
        </div>
        <button disabled={!canSubmit} onClick={() => setStep("verify")} className={`mt-6 w-full font-display tracking-widest text-sm py-4 rounded-lg ${canSubmit ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
          CONTINUE TO VERIFICATION
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 bg-white text-center">
      <div className="font-display text-5xl tracking-tight mb-2">VHI</div>
      <div className="font-display text-xs tracking-widest text-gray-400 mb-6">VETERAN HEALTH INITIATIVE</div>
      <p className="font-body text-gray-600 mb-8">Squad-based accountability. Weekly check-ins. A free year of gym membership &mdash; together, not alone.</p>
      {authError && <div className="font-body text-sm text-red-600 mb-4">{authError}</div>}
      <button onClick={() => setStep("form")} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg mb-3">JOIN VHI</button>
      <button onClick={() => setStep("login")} className="w-full border border-black font-display tracking-widest text-sm py-4 rounded-lg mb-3">LOG IN</button>
      <button onClick={handleGoogleSignIn} className="w-full border border-gray-300 font-display tracking-widest text-sm py-4 rounded-lg mb-3 flex items-center justify-center gap-2">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 3l6-6C34.5 5.5 29.6 3.5 24 3.5 12.7 3.5 3.5 12.7 3.5 24S12.7 44.5 24 44.5 44.5 35.3 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 15.9 18.9 13 24 13c3.1 0 5.8 1.1 8 3l6-6C34.5 5.5 29.6 3.5 24 3.5c-7.7 0-14.3 4.4-17.7 11.2z"/>
          <path fill="#4CAF50" d="M24 44.5c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.4C29.6 35.6 26.9 36.5 24 36.5c-5.3 0-9.7-3.3-11.3-8l-6.6 5.1C9.6 40 16.2 44.5 24 44.5z"/>
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.6 5.4C41.7 36.1 44.5 30.6 44.5 24c0-1.2-.1-2.4-.3-3.5z"/>
        </svg>
        CONTINUE WITH GOOGLE
      </button>
      <button onClick={onDemo} className="w-full font-body text-sm text-gray-400 underline py-2">View demo (SGT Webb) &mdash; no account needed</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// COMPLETE PROFILE (for a first-time Google / OAuth sign-in)
// ---------------------------------------------------------------------------

function CompleteProfile({ authUser, onComplete }) {
  const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || "";
  const [nameParts] = useState(() => {
    const parts = googleName.trim().split(" ");
    return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" };
  });
  const [profile, setProfile] = useState({
    firstName: nameParts.first, lastName: nameParts.last, phone: "", rank: "",
    militaryStatus: "Veteran", branch: "ARMY", state: "Georgia", goal: "Weight Loss", weight: "", goalWeight: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = profile.firstName && profile.lastName && profile.phone && profile.weight && profile.goalWeight;

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const result = await assignSquadLive({ state: profile.state });
      const weight = Number(profile.weight);
      const goal = Number(profile.goalWeight);
      const { error: insertError } = await supabase.from("profiles").insert({
        id: authUser.id,
        first_name: profile.firstName,
        last_name: profile.lastName,
        rank: profile.rank.trim() || "Pvt.",
        branch: profile.branch,
        military_status: profile.militaryStatus,
        state: profile.state,
        phone: profile.phone,
        squad_id: result.squad.id,
        status: "AMBER",
        streak: 0,
        workouts_this_week: 0,
        note: "New member \u2014 first check-in pending",
        joined: new Date().toISOString().slice(0, 10),
        weight_start: weight,
        weight_current: weight,
        goal_weight: goal,
        weeks_since_join: 0,
        checkins_completed: 0,
        connection_improved: false,
        grace_available: true,
        organization_id: VHI_ORG_ID,
        grace_reset_at: new Date().toISOString().slice(0, 10),
      });
      if (insertError) throw insertError;
      onComplete({
        id: authUser.id, rank: profile.rank.trim() || "Pvt.", firstName: profile.firstName, lastName: profile.lastName,
        branch: profile.branch, militaryStatus: profile.militaryStatus, state: profile.state, squadId: result.squad.id,
        status: "AMBER", streak: 0, workoutsThisWeek: 0, note: "New member \u2014 first check-in pending",
        joined: new Date().toISOString().slice(0, 10), weightStart: weight, weightCurrent: weight, goalWeight: goal,
        weeksSinceJoin: 0, checkinsCompleted: 0, connectionImproved: false,
      }, result.squad);
    } catch (err) {
      setError(err.message || String(err));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10 bg-white">
      <div className="font-display text-3xl mb-1">ALMOST THERE</div>
      <p className="font-body text-sm text-gray-500 mb-6">
        Signed in as {authUser.email}. Just need a few details to place you in the right squad.
      </p>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">FIRST NAME</span>
            <input value={profile.firstName} onChange={(e) => setProfile({ ...profile, firstName: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">LAST NAME</span>
            <input value={profile.lastName} onChange={(e) => setProfile({ ...profile, lastName: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
        </div>
        <label className="block">
          <span className="font-display text-xs tracking-widest text-gray-400">PHONE NUMBER</span>
          <input type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="(555) 555-5555" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
        </label>
        <label className="block">
          <span className="font-display text-xs tracking-widest text-gray-400">BRANCH</span>
          <select value={profile.branch} onChange={(e) => setProfile({ ...profile, branch: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
            {BRANCHES.map((b) => <option key={b}>{b}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">RANK</span>
            <input value={profile.rank} onChange={(e) => setProfile({ ...profile, rank: e.target.value })} placeholder="e.g. SGT, Cpl., PO2" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">STATUS</span>
            <select value={profile.militaryStatus} onChange={(e) => setProfile({ ...profile, militaryStatus: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
              {MILITARY_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <span className="font-display text-xs tracking-widest text-gray-400">HOME STATE</span>
          <select value={profile.state} onChange={(e) => setProfile({ ...profile, state: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
            {STATES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <span className="font-body text-xs text-gray-400">This sets your formation: Formation {STATE_TO_FORMATION[profile.state]}</span>
        </label>
        <label className="block">
          <span className="font-display text-xs tracking-widest text-gray-400">PRIMARY GOAL</span>
          <select value={profile.goal} onChange={(e) => setProfile({ ...profile, goal: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body bg-white focus:outline-none focus:ring-2 focus:ring-black">
            {GOALS.map((g) => <option key={g}>{g}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">CURRENT WEIGHT (LBS)</span>
            <input type="number" value={profile.weight} onChange={(e) => setProfile({ ...profile, weight: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">GOAL WEIGHT (LBS)</span>
            <input type="number" value={profile.goalWeight} onChange={(e) => setProfile({ ...profile, goalWeight: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
        </div>
      </div>
      {error && <div className="font-body text-sm text-red-600 mt-4">{error}</div>}
      <button disabled={!canSubmit || loading} onClick={handleSubmit} className={`mt-6 w-full font-display tracking-widest text-sm py-4 rounded-lg ${canSubmit ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
        {loading ? "SETTING UP\u2026" : "FIND MY SQUAD"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FEED
// ---------------------------------------------------------------------------

function Feed({ posts, onPost, onFist, onComment, onEditPost, onDeletePost, onEditComment, onDeleteComment, onStarComment, currentUser, mySquad, veterans, challenge, onLogReps, scope, setScope }) {
  const [text, setText] = useState("");
  const [repsInput, setRepsInput] = useState("");
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [commentDrafts, setCommentDrafts] = useState({});
  const [editingPostId, setEditingPostId] = useState(null);
  const [postEditText, setPostEditText] = useState("");
  const [editingComment, setEditingComment] = useState(null); // `${postId}:${index}`
  const [commentEditText, setCommentEditText] = useState("");

  function handlePost() {
    if (!text.trim()) return;
    onPost({ id: Date.now(), scope, squadId: currentUser.squadId, authorId: currentUser.id, author: `${currentUser.rank} ${currentUser.firstName} ${currentUser.lastName}`, branch: currentUser.branch, time: "now", text: text.trim(), fists: 0, comments: [] });
    setText("");
  }

  const visible = posts.filter((p) => (scope === "battalion" ? p.scope === "battalion" : p.scope === "squad" && p.squadId === currentUser.squadId));
  const squadMembers = veterans.filter((v) => v.squadId === currentUser.squadId);
  const squadCheckedIn = squadMembers.filter((v) => v.status === "GREEN").length;

  return (
    <div className="space-y-6">
      <div className="flex bg-gray-100 rounded-lg p-1">
        {[["battalion", "BATTALION"], ["squad", "SQUAD"]].map(([key, label]) => (
          <button key={key} onClick={() => setScope(key)} className={`flex-1 font-display text-xs tracking-widest py-2.5 rounded-md ${scope === key ? "bg-black text-white" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>

      {scope === "battalion" && (
        <div className="bg-black text-white rounded-lg p-5">
          <div className="text-xs font-display tracking-widest text-gray-400 mb-3">WEEKLY CHALLENGE &middot; ENDS SUN 2359</div>
          <div className="font-display text-3xl mb-2">{challenge.title}</div>
          <p className="font-body text-gray-300 mb-4">{challenge.description}</p>
          <div className="flex items-center justify-between mb-1">
            <span className="font-display text-sm tracking-widest text-gray-300">{challenge.completed}/{challenge.total} VETERANS</span>
          </div>
          {challenge.userReps > 0 && <div className="font-body text-xs text-gray-400 mb-3">Your reps: {challenge.userReps}/100</div>}
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              value={repsInput}
              onChange={(e) => setRepsInput(e.target.value)}
              placeholder="Reps just done"
              className="flex-1 bg-transparent border border-white rounded px-3 py-2 font-body text-white placeholder-gray-500 focus:outline-none"
            />
            <button
              onClick={() => {
                const n = Number(repsInput);
                if (n > 0) {
                  onLogReps(n);
                  setRepsInput("");
                }
              }}
              className="font-display tracking-widest text-xs border border-white px-4 py-2 rounded hover:bg-white hover:text-black transition-colors shrink-0"
            >
              LOG REPS
            </button>
          </div>
        </div>
      )}

      {scope === "squad" && (
        <div className="bg-black text-white rounded-lg p-5">
          <div className="text-xs font-display tracking-widest text-gray-400 mb-2">SQUAD PULSE &middot; {squadDisplayName(mySquad).toUpperCase()}</div>
          <div className="font-display text-3xl mb-1">{squadCheckedIn}/{squadMembers.length} GREEN</div>
          <p className="font-body text-gray-300 text-sm">Everyone here is responsible to everyone else &mdash; no one's watching from the top.</p>
        </div>
      )}

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex gap-3">
          <Avatar rank={currentUser.rank} firstName={currentUser.firstName} size={44} photoUrl={currentUser.photoUrl} />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={scope === "battalion" ? "Post to all of VHI..." : "Post to your squad..."} className="flex-1 border border-gray-300 rounded-lg px-3 font-body focus:outline-none focus:ring-2 focus:ring-black" />
        </div>
        <button onClick={handlePost} className="mt-3 w-full bg-black text-white font-display tracking-widest text-sm py-3 rounded-lg">POST</button>
      </div>

      <SectionLabel>{scope === "battalion" ? "BATTALION FEED" : "SQUAD FEED"}</SectionLabel>
      <div className="space-y-4">
        {visible.map((post) => {
          const vet = veterans.find((v) => `${v.rank} ${v.firstName} ${v.lastName}` === post.author);
          const isExpanded = expandedPostId === post.id;
          const isMine = post.authorId === currentUser.id;
          const isEditingPost = editingPostId === post.id;
          return (
            <div key={post.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Avatar rank={vet ? vet.rank : "V"} firstName={vet ? vet.firstName : post.author} size={44} photoUrl={vet ? vet.photoUrl : null} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-body font-semibold">{post.author}</span>
                    {isMine ? (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => { setEditingPostId(post.id); setPostEditText(post.text); }} className="font-display text-xs tracking-widest text-gray-400">EDIT</button>
                        <button onClick={() => { if (window.confirm("Delete this post?")) onDeletePost(post.id); }} className="font-display text-xs tracking-widest text-gray-400">DELETE</button>
                      </div>
                    ) : (
                      <button className="font-display text-xs tracking-widest border border-gray-300 rounded px-2 py-1 text-gray-500">MSG</button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 mb-2">
                    <BranchBadge branch={post.branch} />
                    <span className="font-body text-xs text-gray-400">{post.time}</span>
                  </div>
                  {isEditingPost ? (
                    <div className="space-y-2">
                      <textarea value={postEditText} onChange={(e) => setPostEditText(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 font-body text-sm focus:outline-none focus:ring-2 focus:ring-black" rows={3} />
                      <div className="flex gap-2">
                        <button onClick={() => setEditingPostId(null)} className="font-display text-xs tracking-widest border border-black rounded px-3 py-1.5">CANCEL</button>
                        <button
                          onClick={() => {
                            if (postEditText.trim()) onEditPost(post.id, postEditText.trim());
                            setEditingPostId(null);
                          }}
                          className="font-display text-xs tracking-widest bg-black text-white rounded px-3 py-1.5"
                        >
                          SAVE
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-body text-gray-800">{post.text}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3">
                    <button onClick={() => onFist(post.id)} className="flex items-center gap-1.5 font-body text-sm text-gray-500">{"\u{1F44A}"} {post.fists}</button>
                    <button onClick={() => setExpandedPostId(isExpanded ? null : post.id)} className="font-display text-xs tracking-widest border border-gray-300 rounded px-2 py-1 text-gray-500">
                      {post.comments.length} COMMENTS
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 space-y-3 border-t border-gray-100 pt-3">
                      {post.comments.map((c, i) => {
                        const key = `${post.id}:${i}`;
                        const isMyComment = c.authorId === currentUser.id;
                        const isEditingThis = editingComment === key;
                        return (
                          <div key={i} className="font-body text-sm border-b border-gray-50 last:border-0 pb-2">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold">{c.author}</span>
                              <span className="text-gray-400 text-xs">{c.time}</span>
                            </div>
                            {isEditingThis ? (
                              <div className="flex gap-2 mt-1">
                                <input value={commentEditText} onChange={(e) => setCommentEditText(e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black" />
                                <button onClick={() => setEditingComment(null)} className="font-display text-[10px] tracking-widest text-gray-400">CANCEL</button>
                                <button
                                  onClick={() => {
                                    if (commentEditText.trim()) onEditComment(post.id, i, commentEditText.trim());
                                    setEditingComment(null);
                                  }}
                                  className="font-display text-[10px] tracking-widest text-black"
                                >
                                  SAVE
                                </button>
                              </div>
                            ) : (
                              <div className="text-gray-700">{c.text}</div>
                            )}
                            <div className="flex items-center gap-3 mt-1">
                              <button onClick={() => onStarComment(post.id, i)} className="flex items-center gap-1 text-xs text-gray-500">
                                {"\u2B50"} {c.stars || 0}
                              </button>
                              {isMyComment && !isEditingThis && (
                                <>
                                  <button onClick={() => { setEditingComment(key); setCommentEditText(c.text); }} className="text-xs text-gray-400">EDIT</button>
                                  <button onClick={() => onDeleteComment(post.id, i)} className="text-xs text-gray-400">DELETE</button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex gap-2 pt-1">
                        <input
                          value={commentDrafts[post.id] || ""}
                          onChange={(e) => setCommentDrafts((prev) => ({ ...prev, [post.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (commentDrafts[post.id] || "").trim()) {
                              onComment(post.id, commentDrafts[post.id].trim());
                              setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
                            }
                          }}
                          placeholder="Add a comment..."
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 font-body text-sm focus:outline-none focus:ring-2 focus:ring-black"
                        />
                        <button
                          onClick={() => {
                            if ((commentDrafts[post.id] || "").trim()) {
                              onComment(post.id, commentDrafts[post.id].trim());
                              setCommentDrafts((prev) => ({ ...prev, [post.id]: "" }));
                            }
                          }}
                          className="font-display text-xs tracking-widest bg-black text-white rounded px-3"
                        >
                          POST
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <div className="font-body text-sm text-gray-400 text-center py-6">Nothing here yet. Be the first to post.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WORKOUT — freeform logger + suggested weekly regimen, with local recall
// ---------------------------------------------------------------------------

function WorkoutLogger({ title, initialNames, editableNames, exerciseLog, onCancel, onSave, suggestions }) {
  const [entries, setEntries] = useState(initialNames.map((name) => ({ name, weight: "", reps: "", sets: "" })));

  function update(i, field, value) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));
  }
  function addRow(name = "") {
    setEntries((prev) => {
      // Fill the first empty-named row instead of piling on duplicates, if one exists
      const emptyIdx = prev.findIndex((e) => !e.name.trim());
      if (name && emptyIdx !== -1) {
        return prev.map((e, idx) => (idx === emptyIdx ? { ...e, name } : e));
      }
      return [...prev, { name, weight: "", reps: "", sets: "" }];
    });
  }
  function removeRow(i) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }
  function handleSave() {
    const logged = entries.filter((e) => e.name.trim() && (e.weight || e.reps));
    if (logged.length === 0) return;
    onSave(logged);
  }

  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      {suggestions && suggestions.length > 0 && (
        <div className="mb-4">
          <div className="font-body text-xs text-gray-400 mb-2">Tap to add:</div>
          <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
            {suggestions.map((name) => (
              <button key={name} onClick={() => addRow(name)} className="font-body text-xs border border-gray-300 rounded-full px-3 py-1.5 text-gray-700 hover:border-black">
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-4 mb-6">
        {entries.map((e, i) => {
          const last = e.name.trim() ? getLastLog(exerciseLog, e.name) : null;
          return (
            <div key={i} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                {editableNames ? (
                  <input value={e.name} onChange={(ev) => update(i, "name", ev.target.value)} placeholder="Exercise name" className="flex-1 border-b border-gray-300 pb-1 font-body font-semibold focus:outline-none" />
                ) : (
                  <span className="flex-1 font-body font-semibold">{e.name}</span>
                )}
                {editableNames && entries.length > 1 && (
                  <button onClick={() => removeRow(i)} aria-label="Remove exercise">
                    <Trash2 size={16} className="text-gray-400" />
                  </button>
                )}
              </div>
              {last && (
                <div className="font-body text-xs text-gray-400 mb-2">
                  Last time: {last.sets}x{last.reps} @ {last.weight} lbs ({last.date})
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="font-display text-[10px] tracking-widest text-gray-400">WEIGHT</span>
                  <input type="number" value={e.weight} onChange={(ev) => update(i, "weight", ev.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
                </label>
                <label className="block">
                  <span className="font-display text-[10px] tracking-widest text-gray-400">REPS</span>
                  <input type="number" value={e.reps} onChange={(ev) => update(i, "reps", ev.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
                </label>
                <label className="block">
                  <span className="font-display text-[10px] tracking-widest text-gray-400">SETS</span>
                  <input type="number" value={e.sets} onChange={(ev) => update(i, "sets", ev.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
                </label>
              </div>
            </div>
          );
        })}
        {editableNames && (
          <button onClick={() => addRow()} className="w-full border border-dashed border-gray-300 rounded-lg py-2.5 font-display text-xs tracking-widest text-gray-500 flex items-center justify-center gap-1.5">
            <Plus size={14} /> ADD EXERCISE
          </button>
        )}
      </div>
      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 border border-black font-display tracking-widest text-sm py-4 rounded-lg">CANCEL</button>
        <button onClick={handleSave} className="flex-1 bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg">SAVE WORKOUT</button>
      </div>
    </div>
  );
}

function Workout({ stats, exerciseLog, regimenCompleted, onLogWorkout, showDemoData }) {
  const [mode, setMode] = useState(null);

  if (mode === "custom") {
    return <WorkoutLogger title="LOG CUSTOM WORKOUT" initialNames={[""]} editableNames exerciseLog={exerciseLog} onCancel={() => setMode(null)} onSave={(entries) => { onLogWorkout(entries, null, "Custom Workout"); setMode(null); }} />;
  }
  if (mode && mode.muscleGroup) {
    return (
      <WorkoutLogger
        title={`${mode.muscleGroup} EXERCISES`}
        initialNames={[""]}
        editableNames
        exerciseLog={exerciseLog}
        suggestions={MUSCLE_GROUP_EXERCISES[mode.muscleGroup]}
        onCancel={() => setMode(null)}
        onSave={(entries) => { onLogWorkout(entries, null, `${mode.muscleGroup} Day`); setMode(null); }}
      />
    );
  }
  if (mode) {
    const template = WORKOUT_TEMPLATES.find((t) => t.id === mode.templateId);
    const sessionLabel = mode.day ? `${mode.day} \u2014 ${template.name}` : `${template.name} (Custom)`;
    return (
      <WorkoutLogger
        title={mode.day ? `${mode.day.toUpperCase()} \u2014 ${template.name.toUpperCase()}` : template.name.toUpperCase()}
        initialNames={template.exercises}
        editableNames={false}
        exerciseLog={exerciseLog}
        onCancel={() => setMode(null)}
        onSave={(entries) => { onLogWorkout(entries, mode.day, sessionLabel); setMode(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-black text-white rounded-lg p-5">
        <div className="flex justify-between mb-4">
          <div>
            <div className="font-display text-4xl">{stats.total}</div>
            <div className="font-display text-xs tracking-widest text-gray-400">TOTAL WORKOUTS</div>
          </div>
          <div className="text-right">
            <div className="font-display text-4xl">{stats.streak}</div>
            <div className="font-display text-xs tracking-widest text-gray-400">WEEK STREAK</div>
          </div>
        </div>
        {showDemoData && (
          <div className="border-t border-gray-700 pt-4 grid grid-cols-3 gap-2">
            {[["BENCH", stats.bench], ["SQUAT", stats.squat], ["DEADLIFT", stats.deadlift]].map(([label, val]) => (
              <div key={label}>
                <div className="font-display text-2xl">{val}<span className="text-sm">lb</span></div>
                <div className="font-display text-xs tracking-widest text-gray-400">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={() => setMode("custom")} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg flex items-center justify-center gap-2">
        <Plus size={16} /> LOG CUSTOM WORKOUT
      </button>

      <div>
        <SectionLabel>THIS WEEK'S SUGGESTED REGIMEN</SectionLabel>
        <div className="space-y-2">
          {WEEKLY_PLAN.map((d) => {
            const template = d.templateId ? WORKOUT_TEMPLATES.find((t) => t.id === d.templateId) : null;
            const done = regimenCompleted[d.day];
            return (
              <div key={d.day} className="border border-gray-200 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-body font-semibold">{d.day}</div>
                  <div className="font-body text-sm text-gray-400">{template ? template.name : "Rest day"}</div>
                </div>
                {template ? (
                  done ? (
                    <span className="font-display text-xs tracking-widest text-emerald-600 border border-emerald-600 rounded px-3 py-2">LOGGED</span>
                  ) : (
                    <button onClick={() => setMode({ day: d.day, templateId: d.templateId })} className="font-display text-xs tracking-widest bg-black text-white rounded px-4 py-2">LOG</button>
                  )
                ) : (
                  <span className="font-body text-xs text-gray-300">&mdash;</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <SectionLabel>VOLUME THIS MONTH (&times;100 LBS)</SectionLabel>
        {showDemoData ? (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={VOLUME_HISTORY} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#E5E5E5" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontFamily: "Archivo", fontSize: 11, fill: "#999" }} axisLine={{ stroke: "#000" }} tickLine={false} />
                <YAxis tick={{ fontFamily: "Archivo", fontSize: 11, fill: "#999" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ border: "2px solid black", borderRadius: 6, fontFamily: "Archivo", fontSize: 12 }} />
                <Line type="monotone" dataKey="volume" stroke="#000" strokeWidth={2.5} dot={{ r: 4, fill: "#000" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-40 flex items-center justify-center font-body text-sm text-gray-400 text-center px-6">
            Log a few workouts and your volume trend will show up here.
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <SectionLabel>MUSCLES TRAINED THIS WEEK</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.muscles).map(([name, count]) => (
            <span key={name} className={`font-display text-xs tracking-widest px-3 py-2 rounded ${count > 0 ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
              {name}{count > 0 ? ` ${count}` : ""}
            </span>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>OR START ANY WORKOUT</SectionLabel>
        <div className="space-y-3">
          {WORKOUT_TEMPLATES.map((t) => (
            <div key={t.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-body font-semibold text-lg">{t.name}</div>
                  <div className="font-body text-sm text-gray-400">{t.exercises.length} exercises</div>
                </div>
                <button onClick={() => setMode({ day: null, templateId: t.id })} className="font-display text-xs tracking-widest bg-gray-100 rounded px-3 py-2">LOG</button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {t.exercises.map((ex) => (
                  <span key={ex} className="font-body text-xs border border-gray-300 rounded px-2 py-1 text-gray-600">{ex}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>SPECIALIZED &mdash; BY MUSCLE GROUP</SectionLabel>
        <p className="font-body text-xs text-gray-400 mb-3">20+ exercises each. Tap a group to log against it.</p>
        <div className="grid grid-cols-2 gap-2">
          {MUSCLE_GROUP_ORDER.map((group) => (
            <button
              key={group}
              onClick={() => setMode({ muscleGroup: group })}
              className="border border-gray-200 rounded-lg p-3 flex items-center justify-between hover:border-black"
            >
              <span className="font-body font-semibold text-sm">{group.charAt(0) + group.slice(1).toLowerCase()}</span>
              <span className="font-body text-xs text-gray-400">{MUSCLE_GROUP_EXERCISES[group].length}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CHECK-IN
// ---------------------------------------------------------------------------

const MOODS = [
  { key: "rough", label: "Rough", emoji: "\u{1F61E}" }, { key: "low", label: "Low", emoji: "\u{1F615}" },
  { key: "okay", label: "Okay", emoji: "\u{1F610}" }, { key: "good", label: "Good", emoji: "\u{1F642}" },
  { key: "locked", label: "Locked In", emoji: "\u{1F4AA}" },
];
const ENERGY_LEVELS = ["Empty", "Low", "Moderate", "High", "Maxed"];

function ProgressSteps({ step }) {
  return (
    <div className="flex gap-1 mb-6">
      {[1, 2, 3].map((n) => <div key={n} className={`flex-1 h-1 rounded-full ${n <= step ? "bg-black" : "bg-gray-200"}`} />)}
    </div>
  );
}

function CheckIn({ currentUser, weightHistory, goalWeight, onSubmit }) {
  const [mode, setMode] = useState(() => (currentUser.checkinsCompleted > 0 ? "summary" : 1));
  const latest = weightHistory[weightHistory.length - 1];
  const [form, setForm] = useState({ weight: String(latest.weight), goalWeight: String(goalWeight), mood: "okay", sleep: 7, energy: "Moderate", connection: null, sustains: ["", "", ""], improves: ["", "", ""] });
  const start = weightHistory[0].weight;
  const toGo = Math.max(0, latest.weight - goalWeight);
  const pct = start === goalWeight ? 100 : Math.round(((start - latest.weight) / (start - goalWeight)) * 100);

  if (mode === "summary") {
    return (
      <div className="space-y-6">
        <div className="bg-black text-white rounded-lg p-6">
          <div className="font-display text-xs tracking-widest text-gray-400 mb-2">WEEK {currentUser.checkinsCompleted} CHECK-IN</div>
          <div className="font-display text-5xl mb-4">COMPLETE</div>
          <StatusBadge status="GREEN" size="lg" />
        </div>
        <div className="border border-gray-200 rounded-lg p-5">
          <SectionLabel>WEIGHT PROGRESS</SectionLabel>
          <div className="flex justify-between items-end mb-2">
            <div className="font-display text-4xl">{latest.weight} <span className="text-lg">lbs</span></div>
            <div className="text-right">
              <div className="font-display text-2xl">{toGo} to go</div>
              <div className="font-body text-sm text-gray-400">{Math.max(0, Math.min(100, pct))}% complete</div>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-black" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
          <WeightChart data={weightHistory} goal={goalWeight} />
        </div>
        <button onClick={() => setMode(1)} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg">UPDATE CHECK-IN</button>
      </div>
    );
  }

  if (mode === 1) {
    return (
      <div>
        <ProgressSteps step={1} />
        <SectionLabel>WEEKLY WEIGHT CHECK-IN</SectionLabel>
        <div className="space-y-4 mb-6">
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">CURRENT WEIGHT (LBS)</span>
            <input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-3 font-display text-2xl focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
          <label className="block">
            <span className="font-display text-xs tracking-widest text-gray-400">GOAL WEIGHT (LBS)</span>
            <input type="number" value={form.goalWeight} onChange={(e) => setForm({ ...form, goalWeight: e.target.value })} className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-3 font-display text-2xl focus:outline-none focus:ring-2 focus:ring-black" />
          </label>
        </div>
        <button onClick={() => setMode(2)} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg">NEXT &mdash; WELLNESS</button>
      </div>
    );
  }

  if (mode === 2) {
    return (
      <div>
        <ProgressSteps step={2} />
        <SectionLabel>WELLNESS CHECK</SectionLabel>
        <div className="mb-6">
          <div className="font-body font-semibold mb-3">How are you feeling?</div>
          <div className="flex justify-between">
            {MOODS.map((m) => (
              <button key={m.key} onClick={() => setForm({ ...form, mood: m.key })} className="flex flex-col items-center gap-1">
                <span className="text-3xl">{m.emoji}</span>
                <span className={`font-body text-xs ${form.mood === m.key ? "border-b-2 border-black" : "text-gray-400"}`}>{m.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="mb-6">
          <div className="font-body font-semibold mb-2">Sleep last night (hrs)</div>
          <div className="flex justify-between font-body text-xs text-gray-400 mb-1">
            <span>4</span><span className="font-display text-lg text-black">{form.sleep}h</span><span>10</span>
          </div>
          <input type="range" min={4} max={10} value={form.sleep} onChange={(e) => setForm({ ...form, sleep: Number(e.target.value) })} className="w-full accent-black" />
        </div>
        <div className="mb-6">
          <div className="font-body font-semibold mb-2">Energy level</div>
          <div className="grid grid-cols-5 gap-1">
            {ENERGY_LEVELS.map((lvl) => (
              <button key={lvl} onClick={() => setForm({ ...form, energy: lvl })} className={`font-body text-xs py-2 rounded border ${form.energy === lvl ? "bg-black text-white border-black" : "border-gray-300 text-gray-600"}`}>{lvl}</button>
            ))}
          </div>
        </div>
        <div className="mb-6">
          <div className="font-body font-semibold mb-2">Do you feel more connected to your squad this week?</div>
          <div className="grid grid-cols-2 gap-3">
            {[["Yes", true], ["Not really", false]].map(([label, val]) => (
              <button key={label} onClick={() => setForm({ ...form, connection: val })} className={`font-body text-sm py-3 rounded-lg border ${form.connection === val ? "bg-black text-white border-black" : "border-gray-300 text-gray-600"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setMode(1)} className="flex-1 border border-black font-display tracking-widest text-sm py-4 rounded-lg">BACK</button>
          <button onClick={() => setMode(3)} className="flex-1 bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg">NEXT &mdash; AAR</button>
        </div>
      </div>
    );
  }

  const canSubmit = form.sustains.every((s) => s.trim()) && form.improves.every((s) => s.trim());
  return (
    <div>
      <ProgressSteps step={3} />
      <SectionLabel>AFTER ACTION REVIEW</SectionLabel>
      <div className="mb-6">
        <div className="font-body font-semibold mb-2">Sustain (3)</div>
        <div className="space-y-2">
          {form.sustains.map((s, i) => (
            <input key={i} value={s} onChange={(e) => { const next = [...form.sustains]; next[i] = e.target.value; setForm({ ...form, sustains: next }); }} placeholder={`Sustain ${i + 1} \u2014 what's working`} className="w-full border border-gray-300 rounded-lg px-3 py-3 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          ))}
        </div>
      </div>
      <div className="mb-6">
        <div className="font-body font-semibold mb-2">Improve (3)</div>
        <div className="space-y-2">
          {form.improves.map((s, i) => (
            <input key={i} value={s} onChange={(e) => { const next = [...form.improves]; next[i] = e.target.value; setForm({ ...form, improves: next }); }} placeholder={`Improve ${i + 1} \u2014 what needs work`} className="w-full border border-gray-300 rounded-lg px-3 py-3 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          ))}
        </div>
      </div>
      <div className="flex gap-3">
        <button onClick={() => setMode(2)} className="flex-1 border border-black font-display tracking-widest text-sm py-4 rounded-lg">BACK</button>
        <button
          disabled={!canSubmit}
          onClick={() => { onSubmit({ weight: Number(form.weight), goalWeight: Number(form.goalWeight), sustains: form.sustains, improves: form.improves, connection: form.connection === null ? true : form.connection }); setMode("summary"); }}
          className={`flex-1 font-display tracking-widest text-sm py-4 rounded-lg ${canSubmit ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}
        >
          SUBMIT CHECK-IN
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BOARD
// ---------------------------------------------------------------------------

function Board({ veterans, currentUser, mySquad, onMsg }) {
  const [scope, setScope] = useState("NATIONAL");
  const [sortBy, setSortBy] = useState("STREAK");

  const scoped = useMemo(() => {
    if (scope === "STATE") return veterans.filter((v) => v.state === currentUser.state);
    if (scope === "SQUAD") return veterans.filter((v) => v.squadId === currentUser.squadId);
    return veterans;
  }, [veterans, scope, currentUser]);

  const scopeLabel = scope === "STATE" ? `STATE \u00B7 ${currentUser.state.toUpperCase()}` : scope === "SQUAD" ? `SQUAD \u00B7 ${squadDisplayName(mySquad).toUpperCase()}` : "NATIONAL";

  const counts = useMemo(() => {
    const c = { GREEN: 0, AMBER: 0, RED: 0 };
    scoped.forEach((v) => c[v.status]++);
    return c;
  }, [scoped]);
  const sorted = useMemo(() => {
    const arr = [...scoped];
    if (sortBy === "STREAK") arr.sort((a, b) => b.streak - a.streak);
    if (sortBy === "WORKOUTS") arr.sort((a, b) => b.workoutsThisWeek - a.workoutsThisWeek);
    if (sortBy === "PROGRESS") arr.sort((a, b) => (a.status === b.status ? b.streak - a.streak : a.status === "RED" ? 1 : b.status === "RED" ? -1 : 0));
    return arr;
  }, [scoped, sortBy]);
  const total = scoped.length || 1;

  return (
    <div className="space-y-6">
      <div className="flex bg-gray-100 rounded-lg p-1">
        {[["NATIONAL", "NATIONAL"], ["STATE", "STATE"], ["SQUAD", "SQUAD"]].map(([key, label]) => (
          <button key={key} onClick={() => setScope(key)} className={`flex-1 font-display text-xs tracking-widest py-2.5 rounded-md ${scope === key ? "bg-black text-white" : "text-gray-500"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="bg-black text-white rounded-lg p-5">
        <div className="font-display text-xs tracking-widest text-gray-400 mb-4">{scopeLabel} READINESS</div>
        <div className="grid grid-cols-3 divide-x divide-gray-700 mb-4">
          {["GREEN", "AMBER", "RED"].map((s) => (
            <div key={s} className="text-center">
              <div className={`font-display text-4xl ${STATUS_STYLES[s].text}`}>{counts[s]}</div>
              <div className="font-display text-xs tracking-widest text-gray-400">{s}</div>
            </div>
          ))}
        </div>
        <div className="flex h-2 rounded-full overflow-hidden">
          <div className="bg-emerald-600" style={{ width: `${(counts.GREEN / total) * 100}%` }} />
          <div className="bg-amber-500" style={{ width: `${(counts.AMBER / total) * 100}%` }} />
          <div className="bg-red-600" style={{ width: `${(counts.RED / total) * 100}%` }} />
        </div>
      </div>
      <div className="flex gap-2">
        {["STREAK", "WORKOUTS", "PROGRESS"].map((s) => (
          <button key={s} onClick={() => setSortBy(s)} className={`font-display text-xs tracking-widest px-4 py-2 rounded ${sortBy === s ? "bg-black text-white" : "border border-gray-300 text-gray-500"}`}>{s}</button>
        ))}
      </div>
      {sorted.length === 0 && <div className="font-body text-sm text-gray-400 text-center py-6">No one else in this view yet.</div>}
      <div className="space-y-3">
        {sorted.map((v, i) => (
          <div key={v.id} className={`border-l-4 ${STATUS_STYLES[v.status].border.replace("border-", "border-l-")} border-t border-r border-b border-gray-200 rounded-lg p-4`}>
            <div className="flex items-center gap-3">
              <span className="font-display text-2xl text-gray-300 w-6 text-center shrink-0">{i + 1}</span>
              <Avatar rank={v.rank} firstName={v.firstName} size={44} photoUrl={v.photoUrl} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-body font-semibold truncate">{v.rank} {v.firstName} {v.lastName}</span>
                  <button onClick={() => onMsg(v.id)} className="font-display text-xs tracking-widest border border-gray-300 rounded px-2 py-1 text-gray-500 shrink-0">MSG</button>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <BranchBadge branch={v.branch} />
                  <StatusBadge status={v.status} />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2 pl-16">
              <span className="font-body text-xs text-gray-400">{v.note}</span>
              <div className="text-right">
                <div className="font-display text-2xl leading-none">{v.streak}</div>
                <div className="font-body text-xs text-gray-400">wk streak</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQUADS — a veteran can only see their own squad
// ---------------------------------------------------------------------------

function Squads({ veterans, currentUser, mySquad, onMsg, onNudge }) {
  const members = veterans.filter((v) => v.squadId === mySquad.id);
  const counts = { GREEN: 0, AMBER: 0, RED: 0 };
  members.forEach((m) => counts[m.status]++);

  return (
    <div className="space-y-4">
      <SectionLabel>YOUR SQUAD</SectionLabel>
      <div className="border-2 border-black rounded-lg overflow-hidden">
        <div className="p-4">
          <div className="font-display text-2xl">{squadDisplayName(mySquad)}</div>
          <div className="font-body text-sm text-gray-400 mb-3">{members.length}/{mySquad.capacity} members</div>
          <div className="flex gap-2">
            {["GREEN", "AMBER", "RED"].map((s) => counts[s] > 0 && (
              <span key={s} className={`font-display text-xs tracking-widest text-white px-2 py-1 rounded ${STATUS_STYLES[s].bg}`}>{counts[s]} {s}</span>
            ))}
          </div>
        </div>
        <div className="border-t border-gray-200">
          {members.map((m) => (
            <div key={m.id} className={`border-l-4 ${STATUS_STYLES[m.status].border.replace("border-", "border-l-")} p-4 border-b last:border-b-0 border-gray-100`}>
              <div className="flex items-center gap-3">
                <Avatar rank={m.rank} firstName={m.firstName} size={40} photoUrl={m.photoUrl} />
                <div className="flex-1">
                  <div className="font-body font-semibold">
                    {m.rank} {m.firstName} {m.lastName}
                    {m.id === currentUser.id && <span className="font-body text-xs text-gray-400"> (you)</span>}
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                <div className="text-right">
                  <div className="font-body text-sm">{m.streak}wk &middot; {m.workoutsThisWeek} wkts this wk</div>
                  {m.id !== currentUser.id && (
                    <div className="flex gap-1.5 mt-1 justify-end">
                      {m.status !== "GREEN" && (
                        <button onClick={() => onNudge(m)} className="font-display text-xs tracking-widest border border-gray-300 rounded px-2 py-1 text-gray-500">NUDGE</button>
                      )}
                      <button onClick={() => onMsg(m.id)} className="font-display text-xs tracking-widest border border-gray-300 rounded px-2 py-1 text-gray-500">MSG</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
                <div className={`h-full ${STATUS_STYLES[m.status].bg}`} style={{ width: `${Math.min(100, (m.streak / 15) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="font-body text-xs text-gray-400 text-center pt-2">
        Squads are sectorized by home state (Formation {mySquad.district}, numbered by that state's order of admission to the Union) and fill in order using phonetic call signs &mdash; Alpha, Bravo, Charlie... Once a formation's single call signs are full, new squads combine two, like Alpha-Zulu or Bravo-Yankee. You can only see your own squad &mdash; no picking, no cliques. Invite codes may come later.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MESSAGES
// ---------------------------------------------------------------------------

function Messages({ threads, setThreads, activeThreadId, setActiveThreadId, onSend }) {
  const [draft, setDraft] = useState("");
  if (activeThreadId) {
    const thread = threads[activeThreadId];
    function send() {
      if (!draft.trim()) return;
      onSend(activeThreadId, draft.trim());
      setDraft("");
    }
    return (
      <div className="flex flex-col">
        <div className="flex items-center gap-3 pb-4 border-b border-gray-200 mb-4">
          <button onClick={() => setActiveThreadId(null)}><ArrowLeft size={20} /></button>
          <Avatar rank={thread.contact.split(" ")[0]} firstName={thread.contact.split(" ")[1]} size={40} />
          <div>
            <div className="font-body font-semibold">{thread.contact}</div>
            <StatusBadge status={thread.status} />
          </div>
        </div>
        <div className="flex-1 space-y-3 mb-4">
          {thread.messages.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <div>
                <div className={`px-4 py-2.5 rounded-lg font-body max-w-xs ${m.from === "me" ? "bg-black text-white" : "bg-gray-100 text-black"}`}>{m.text}</div>
                <div className={`font-body text-xs text-gray-400 mt-1 ${m.from === "me" ? "text-right" : ""}`}>{m.time}</div>
              </div>
            </div>
          ))}
          {thread.messages.length === 0 && <div className="font-body text-sm text-gray-400">No messages yet. Say something.</div>}
        </div>
        <div className="flex gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message..." className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 font-body focus:outline-none focus:ring-2 focus:ring-black" />
          <button onClick={send} className="bg-black text-white font-display tracking-widest text-xs px-4 rounded-lg flex items-center gap-1.5"><Send size={14} /> SEND</button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <SectionLabel>DIRECT MESSAGES</SectionLabel>
      {Object.entries(threads).map(([id, t]) => {
        const last = t.messages[t.messages.length - 1];
        return (
          <button key={id} onClick={() => { setActiveThreadId(id); setThreads((prev) => ({ ...prev, [id]: { ...prev[id], unread: false } })); }} className="w-full text-left border border-gray-200 rounded-lg p-4 flex items-center gap-3">
            <div className="relative shrink-0">
              <Avatar rank={t.contact.split(" ")[0]} firstName={t.contact.split(" ")[1]} size={44} />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${STATUS_STYLES[t.status].dot}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-body font-semibold">{t.contact}</div>
              <BranchBadge branch={t.branch} />
              <div className="font-body text-sm text-gray-400 truncate mt-1">{last ? `${last.from === "me" ? "You: " : ""}${last.text}` : "No messages yet"}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-body text-xs text-gray-400 mb-1">{last ? last.time : ""}</div>
              {t.unread ? <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-600" /> : <StatusBadge status={t.status} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PROFILE
// ---------------------------------------------------------------------------

function resizeImageToDataUrl(file, maxSize = 200) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function Profile({ user, mySquad, weightHistory, goalWeight, workoutSessions, onSignOut, onPhotoChange, onDeleteAccount, onOpenAdmin }) {
  const latest = weightHistory[weightHistory.length - 1];
  const start = weightHistory[0].weight;
  const pct = start === goalWeight ? 100 : Math.round(((start - latest.weight) / (start - goalWeight)) * 100);
  const toGo = Math.max(0, latest.weight - goalWeight);
  const groupedSessions = useMemo(() => groupSessionsByDate(workoutSessions), [workoutSessions]);
  const daysSinceJoin = Math.floor((new Date() - new Date(user.joined)) / 86400000);
  const lbsLost = Math.max(0, Math.round((user.weightStart - user.weightCurrent) * 10) / 10);
  const badges = [];
  if (user.checkinsCompleted >= 1) badges.push("FIRST AAR");
  if (daysSinceJoin >= 30) badges.push("30 DAYS");
  if (daysSinceJoin >= 90) badges.push("90 DAYS");
  if (daysSinceJoin >= 180) badges.push("180 DAYS");
  if (daysSinceJoin >= 365) badges.push("1 YEAR");
  if (lbsLost >= 10) badges.push("10 LBS LOST");
  if (lbsLost >= 25) badges.push("25 LBS LOST");
  if (lbsLost >= 50) badges.push("50 LBS LOST");
  if (goalWeight && user.weightCurrent <= goalWeight) badges.push("GOAL REACHED");
  const fileInputRef = React.useRef(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  async function handleConfirmDelete() {
    setDeleting(true);
    setDeleteError(null);
    const { error } = await onDeleteAccount();
    if (error) {
      setDeleteError(error);
      setDeleting(false);
    }
    // On success, onDeleteAccount signs out and the app returns to
    // onboarding on its own — nothing left to do here.
  }

  async function handlePhotoPick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await resizeImageToDataUrl(file);
    onPhotoChange(dataUrl);
  }

  return (
    <div className="space-y-6">
      <div className="bg-black text-white rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="relative">
            <Avatar rank={user.rank} firstName={user.firstName} size={64} photoUrl={user.photoUrl} />
            <button onClick={() => fileInputRef.current?.click()} className="absolute -bottom-1 -right-1 bg-white text-black rounded-full w-6 h-6 flex items-center justify-center" aria-label="Change profile photo">
              <Camera size={12} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoPick} className="hidden" />
          </div>
          <div className="text-right space-y-2">
            <StatusBadge status={user.status} />
            <div className="flex items-center gap-1.5 justify-end font-display text-sm tracking-widest"><Flame size={14} className="text-amber-500" /> {user.streak} WEEKS</div>
          </div>
        </div>
        <div className="font-display text-2xl mb-2">{user.rank} {user.firstName} {user.lastName}</div>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <BranchBadge branch={user.branch} />
          {user.militaryStatus && <span className="font-display text-xs tracking-widest border border-gray-500 rounded px-2 py-1 text-gray-300">{user.militaryStatus.toUpperCase()}</span>}
          {user.mos && <span className="font-display text-xs tracking-widest border border-gray-500 rounded px-2 py-1 text-gray-300">{user.mos}</span>}
          <span className="font-display text-xs tracking-widest border border-gray-500 rounded px-2 py-1 text-gray-300">{squadDisplayName(mySquad).toUpperCase()}</span>
        </div>
        <div className="font-body text-xs text-gray-400">VHI member since {user.joined} &middot; {user.state}</div>
      </div>

      {user.graceNote && (
        <div className="border border-gray-200 rounded-lg p-3 font-body text-xs text-gray-600">{user.graceNote}</div>
      )}
      {user.graceAvailable !== undefined && !user.graceNote && (
        <div className="font-body text-xs text-gray-400 text-center">
          {user.graceAvailable ? "Grace week available \u2014 one missed check-in won't break your streak." : "Grace week already used this quarter."}
        </div>
      )}

      <div className="border border-gray-200 rounded-lg p-4">
        <SectionLabel>MILESTONES</SectionLabel>
        {badges.length === 0 ? (
          <div className="font-body text-sm text-gray-400">Keep checking in \u2014 your first milestone is close.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map((b) => (
              <span key={b} className="font-display text-xs tracking-widest bg-black text-white px-3 py-2 rounded">{b}</span>
            ))}
          </div>
        )}
      </div>

      <div className="border-l-4 border-emerald-600 border-t border-r border-b border-gray-200 rounded-lg p-4">
        <SectionLabel>THIS WEEK'S READINESS</SectionLabel>
        <div className="space-y-3">
          {[["Weekly check-in", user.checkinsCompleted > 0], ["AAR submitted", user.checkinsCompleted > 0], [`\u22652 workouts (${user.workoutsThisWeek}/2 this week)`, user.workoutsThisWeek >= 2]].map(([label, done]) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded flex items-center justify-center text-white text-xs ${done ? "bg-emerald-600" : "bg-gray-300"}`}>{done ? "\u2713" : ""}</div>
              <span className="font-body flex-1">{label}</span>
              <span className={`w-2.5 h-2.5 rounded-full ${done ? "bg-emerald-600" : "bg-gray-300"}`} />
            </div>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-5">
        <SectionLabel>WEIGHT JOURNEY</SectionLabel>
        <div className="flex justify-between items-center mb-2">
          <div>
            <div className="font-display text-3xl">{latest.weight} lbs</div>
            <div className="font-body text-xs text-gray-400">Current</div>
          </div>
          <span className="text-gray-300 text-2xl">&rarr;</span>
          <div className="text-right">
            <div className="font-display text-3xl">{goalWeight} lbs</div>
            <div className="font-body text-xs text-gray-400">Goal</div>
          </div>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
          <div className="h-full bg-black" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </div>
        <div className="font-body text-xs text-gray-400 text-right mb-4">{Math.max(0, Math.min(100, pct))}% &mdash; {toGo} lbs to goal</div>
        <WeightChart data={weightHistory} goal={goalWeight} />
      </div>

      <div className="border border-gray-200 rounded-lg p-5">
        <SectionLabel>WORKOUT HISTORY</SectionLabel>
        {groupedSessions.length === 0 && <div className="font-body text-sm text-gray-400">No workouts logged yet.</div>}
        <div className="space-y-5">
          {groupedSessions.map(([date, sessions]) => (
            <div key={date}>
              <div className="font-display text-xs tracking-widest text-gray-400 mb-2">{date.toUpperCase()}</div>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="font-body font-semibold mb-2">{s.label}</div>
                    <div className="flex flex-wrap gap-2">
                      {s.exercises.map((e, i) => (
                        <span key={i} className="font-body text-xs border border-gray-300 rounded px-2 py-1 text-gray-600">
                          {e.name}: {e.sets}x{e.reps} @ {e.weight} lb
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <SectionLabel>RESOURCES &amp; SUPPORT</SectionLabel>
        <div className="space-y-3 font-body text-sm">
          <div>
            <div className="font-semibold">Veterans Crisis Line</div>
            <div className="text-gray-500">Dial 988, then press 1 &middot; or text 838255</div>
          </div>
          <div>
            <div className="font-semibold">VA Benefits &amp; Services</div>
            <div className="text-gray-500">va.gov</div>
          </div>
          <div>
            <div className="font-semibold">Participating Gyms</div>
            <div className="text-gray-500">Directory coming soon &mdash; check back as VHI adds partner locations.</div>
          </div>
        </div>
      </div>

      {user.isAdmin && (
        <button onClick={onOpenAdmin} className="w-full bg-black text-white font-display tracking-widest text-sm py-4 rounded-lg">
          ADMIN DASHBOARD
        </button>
      )}

      {onSignOut && (
        <button onClick={onSignOut} className="w-full border border-black font-display tracking-widest text-sm py-4 rounded-lg">
          SIGN OUT
        </button>
      )}

      {onDeleteAccount && (
        <div className="border border-red-200 rounded-lg p-4">
          <SectionLabel>DANGER ZONE</SectionLabel>
          {!confirmingDelete ? (
            <button onClick={() => setConfirmingDelete(true)} className="w-full border border-red-600 text-red-600 font-display tracking-widest text-sm py-3 rounded-lg">
              DELETE MY ACCOUNT
            </button>
          ) : (
            <div className="space-y-3">
              <p className="font-body text-sm text-gray-600">
                This permanently deletes your account, check-ins, workouts, posts, and messages. This can't be undone.
              </p>
              {deleteError && <div className="font-body text-xs text-red-600">{deleteError}</div>}
              <div className="flex gap-2">
                <button onClick={() => setConfirmingDelete(false)} disabled={deleting} className="flex-1 border border-black font-display tracking-widest text-xs py-3 rounded-lg">
                  CANCEL
                </button>
                <button onClick={handleConfirmDelete} disabled={deleting} className="flex-1 bg-red-600 text-white font-display tracking-widest text-xs py-3 rounded-lg">
                  {deleting ? "DELETING\u2026" : "YES, DELETE EVERYTHING"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADMIN DASHBOARD (hidden — not part of the member-facing nav)
// ---------------------------------------------------------------------------

// Builds the same stats shape the live RPC returns, but from local demo data
// — so the dashboard UI below can render identically in either mode.
function computeDemoFullStats(veterans, squads, posts, threads) {
  const total = veterans.length || 1;
  const byBranchMap = {};
  const byStateMap = {};
  veterans.forEach((v) => {
    byBranchMap[v.branch] = (byBranchMap[v.branch] || 0) + 1;
    byStateMap[v.state] = (byStateMap[v.state] || 0) + 1;
  });
  const green = veterans.filter((v) => v.status === "GREEN").length;
  const amber = veterans.filter((v) => v.status === "AMBER").length;
  const red = veterans.filter((v) => v.status === "RED").length;
  const at_risk = veterans
    .filter((v) => v.status === "RED")
    .map((v) => ({ name: `${v.rank} ${v.firstName} ${v.lastName}`, squad_id: v.squadId, weeks_behind: Math.max((v.weeksSinceJoin || 0) - (v.checkinsCompleted || 0), 0) }))
    .sort((a, b) => b.weeks_behind - a.weeks_behind);
  const squadsOut = squads.map((sq) => {
    const members = veterans.filter((v) => v.squadId === sq.id);
    return {
      squad_id: sq.id, formation: sq.district, label: sq.label, capacity: sq.capacity,
      member_count: members.length,
      avg_streak: members.length ? Math.round((members.reduce((s, v) => s + v.streak, 0) / members.length) * 10) / 10 : 0,
      green: members.filter((v) => v.status === "GREEN").length,
      amber: members.filter((v) => v.status === "AMBER").length,
      red: members.filter((v) => v.status === "RED").length,
    };
  });
  const totalLbsLost = veterans.reduce((s, v) => s + Math.max((v.weightStart || 0) - (v.weightCurrent || 0), 0), 0);
  return {
    growth: {
      total_enrolled: total, new_7d: null, new_30d: null,
      by_branch: Object.entries(byBranchMap).map(([branch, count]) => ({ branch, count })).sort((a, b) => b.count - a.count),
      by_state: Object.entries(byStateMap).map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count),
    },
    engagement: {
      active_7d: null, active_30d: null,
      pct_completing: Math.round((veterans.reduce((s, v) => s + (v.weeksSinceJoin ? v.checkinsCompleted / v.weeksSinceJoin : 1), 0) / total) * 100),
      weekly_trend: [],
      missed_checkins: veterans.reduce((s, v) => s + Math.max((v.weeksSinceJoin || 0) - (v.checkinsCompleted || 0), 0), 0),
      green_count: green, amber_count: amber, red_count: red, at_risk,
    },
    funding_risk: (() => {
      const list = veterans
        .map((v) => {
          const rawMisses = Math.max((v.weeksSinceJoin || 0) - (v.checkinsCompleted || 0), 0);
          const graceAvailable = v.graceAvailable !== false;
          const unprotected = Math.max(rawMisses - (graceAvailable ? 1 : 0), 0);
          return { name: `${v.rank} ${v.firstName} ${v.lastName}`, squad_id: v.squadId, raw_misses: rawMisses, unprotected_misses: unprotected, grace_available: graceAvailable };
        })
        .filter((r) => r.unprotected_misses >= 2)
        .sort((a, b) => b.unprotected_misses - a.unprotected_misses);
      return { count: list.length, list };
    })(),
    squads: squadsOut,
    health: {
      total_lbs_lost: Math.round(totalLbsLost * 10) / 10,
      avg_lbs_lost: Math.round((totalLbsLost / total) * 10) / 10,
      pct_goal_reached: Math.round((veterans.filter((v) => v.weightCurrent <= v.goalWeight).length / total) * 100),
      avg_checkins_per_person: Math.round((veterans.reduce((s, v) => s + (v.checkinsCompleted || 0), 0) / total) * 10) / 10,
      pct_connection: Math.round((veterans.filter((v) => v.connectionImproved).length / total) * 100),
    },
    community: {
      total_posts: posts.length,
      total_comments: posts.reduce((s, p) => s + (p.comments ? p.comments.length : 0), 0),
      total_fists: posts.reduce((s, p) => s + (p.fists || 0), 0),
      total_messages: Object.values(threads).reduce((s, t) => s + (t.messages ? t.messages.length : 0), 0),
    },
  };
}

function AdminSection({ title, color, children }) {
  const colorMap = {
    violet: "border-violet-500 text-violet-400",
    sky: "border-sky-500 text-sky-400",
    emerald: "border-emerald-500 text-emerald-400",
    amber: "border-amber-500 text-amber-400",
    red: "border-red-500 text-red-400",
  };
  const cls = colorMap[color] || colorMap.sky;
  return (
    <div className={`border-l-4 ${cls.split(" ")[0]} bg-gray-900 rounded-lg p-4 mb-4`}>
      <div className={`font-display text-xs tracking-widest mb-3 ${cls.split(" ")[1]}`}>{title}</div>
      {children}
    </div>
  );
}

function AdminStat({ label, value, color }) {
  const colorMap = { violet: "text-violet-400", sky: "text-sky-400", emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400", white: "text-white" };
  return (
    <div>
      <div className={`font-display text-3xl ${colorMap[color] || colorMap.white}`}>{value}</div>
      <div className="font-body text-xs text-gray-400">{label}</div>
    </div>
  );
}

function AdminDashboard({ veterans, squads, posts, threads, mode, onClose }) {
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState(null);

  useEffect(() => {
    if (mode !== "live") {
      setStats(computeDemoFullStats(veterans, squads, posts, threads));
      return;
    }
    supabase.rpc("get_admin_full_stats").then(({ data, error }) => {
      if (error) setStatsError(error.message);
      else setStats(data);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (statsError) {
    return (
      <div className="fixed inset-0 bg-black text-white z-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="font-body text-red-400 mb-4">{statsError}</div>
          <button onClick={onClose} className="border border-gray-700 rounded-lg px-4 py-2 font-display text-xs tracking-widest">CLOSE</button>
        </div>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="fixed inset-0 bg-black text-white z-50 flex items-center justify-center">
        <div className="font-display text-sm tracking-widest text-gray-400">LOADING&hellip;</div>
      </div>
    );
  }

  const na = (v) => (v === null || v === undefined ? "\u2014" : v);
  const isLive = mode === "live";

  return (
    <div className="fixed inset-0 bg-black text-white z-50 overflow-y-auto">
      <div className="max-w-lg mx-auto px-5 py-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="font-display text-2xl">ADMIN DASHBOARD</div>
            <div className="font-body text-xs text-gray-500">{isLive ? "Live data \u00B7 hidden from members" : "Demo data \u2014 not real"}</div>
          </div>
          <button onClick={onClose} className="border border-gray-700 rounded-full p-2"><X size={18} /></button>
        </div>

        <AdminSection title="GROWTH" color="violet">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <AdminStat label="Total enrolled" value={stats.growth.total_enrolled} color="violet" />
            <AdminStat label="New (7 days)" value={na(stats.growth.new_7d)} color="violet" />
            <AdminStat label="New (30 days)" value={na(stats.growth.new_30d)} color="violet" />
          </div>
          <div className="font-body text-xs text-gray-500 mb-1">By branch</div>
          <div className="flex flex-wrap gap-2 mb-3">
            {stats.growth.by_branch.map((b) => (
              <span key={b.branch} className="font-body text-xs border border-gray-700 rounded px-2 py-1">{b.branch}: {b.count}</span>
            ))}
          </div>
          <div className="font-body text-xs text-gray-500 mb-1">By state</div>
          <div className="flex flex-wrap gap-2">
            {stats.growth.by_state.map((s) => (
              <span key={s.state} className="font-body text-xs border border-gray-700 rounded px-2 py-1">{s.state}: {s.count}</span>
            ))}
          </div>
        </AdminSection>

        <AdminSection title="ENGAGEMENT &amp; RETENTION" color="sky">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <AdminStat label="Active (7 days)" value={na(stats.engagement.active_7d)} color="sky" />
            <AdminStat label="Active (30 days)" value={na(stats.engagement.active_30d)} color="sky" />
            <AdminStat label="% completing check-ins" value={`${stats.engagement.pct_completing}%`} color="sky" />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-4 pt-3 border-t border-gray-800">
            <AdminStat label="Green" value={stats.engagement.green_count} color="emerald" />
            <AdminStat label="Amber" value={stats.engagement.amber_count} color="amber" />
            <AdminStat label="Red" value={stats.engagement.red_count} color="red" />
          </div>
          <div className="font-body text-sm text-gray-300 mb-3">{stats.engagement.missed_checkins} missed check-ins, cohort-wide</div>
          {stats.engagement.weekly_trend.length > 0 && (
            <div className="h-32 mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.engagement.weekly_trend}>
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#999" }} axisLine={{ stroke: "#444" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#999" }} axisLine={false} tickLine={false} width={24} />
                  <Tooltip contentStyle={{ background: "#111", border: "1px solid #38bdf8", borderRadius: 6, fontSize: 12 }} />
                  <Line type="monotone" dataKey="checkins" stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: "#38bdf8" }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </AdminSection>

        {stats.engagement.at_risk.length > 0 && (
          <AdminSection title="OVERALL BEHIND SCHEDULE \u2014 RED STATUS, LIFETIME" color="red">
            <div className="space-y-2">
              {stats.engagement.at_risk.map((v, i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-800 last:border-0 py-1.5">
                  <div>
                    <div className="font-body text-sm">{v.name}</div>
                    <div className="font-body text-xs text-gray-500">{squadDisplayName({ district: (squads.find((s) => s.id === v.squad_id) || {}).district || "?", label: (squads.find((s) => s.id === v.squad_id) || {}).label || v.squad_id })}</div>
                  </div>
                  <span className="font-display text-red-400 text-sm">{v.weeks_behind} wk behind</span>
                </div>
              ))}
            </div>
          </AdminSection>
        )}

        {stats.funding_risk.list.length > 0 && (
          <AdminSection title="GYM FUNDING AT RISK \u2014 2+ UNPROTECTED MISSES IN 30 DAYS" color="red">
            <p className="font-body text-xs text-gray-400 mb-3">
              These people have missed 2 or more check-ins in the last 30 days even after their grace week is accounted for \u2014 worth a personal review before continuing their membership reimbursement.
            </p>
            <div className="space-y-2">
              {stats.funding_risk.list.map((v, i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-800 last:border-0 py-1.5">
                  <div>
                    <div className="font-body text-sm">{v.name}</div>
                    <div className="font-body text-xs text-gray-500">
                      {squadDisplayName({ district: (squads.find((s) => s.id === v.squad_id) || {}).district || "?", label: (squads.find((s) => s.id === v.squad_id) || {}).label || v.squad_id })}
                      {" \u00B7 "}{v.grace_available ? "grace still available" : "grace already used"}
                    </div>
                  </div>
                  <span className="font-display text-red-400 text-sm">{v.unprotected_misses} unprotected</span>
                </div>
              ))}
            </div>
          </AdminSection>
        )}

        <AdminSection title="SQUAD BREAKDOWN &amp; CAPACITY" color="sky">
          <div className="space-y-2">
            {stats.squads.map((s) => (
              <div key={s.squad_id} className="border-b border-gray-800 last:border-0 pb-2">
                <div className="flex justify-between items-center">
                  <span className="font-body text-sm font-semibold">Formation {s.formation} &middot; {s.label}</span>
                  <span className="font-display text-sm">{s.member_count}/{s.capacity}</span>
                </div>
                <div className="flex gap-3 font-body text-xs text-gray-400 mt-0.5">
                  <span className="text-emerald-400">{s.green} green</span>
                  <span className="text-amber-400">{s.amber} amber</span>
                  <span className="text-red-400">{s.red} red</span>
                  <span>avg streak {s.avg_streak}wk</span>
                </div>
              </div>
            ))}
          </div>
        </AdminSection>

        <AdminSection title="HEALTH OUTCOMES" color="emerald">
          <div className="grid grid-cols-2 gap-3">
            <AdminStat label="Total lbs lost, cohort-wide" value={`${stats.health.total_lbs_lost}`} color="emerald" />
            <AdminStat label="Avg lbs lost per person" value={`${stats.health.avg_lbs_lost}`} color="emerald" />
            <AdminStat label="% reached goal weight" value={`${stats.health.pct_goal_reached}%`} color="emerald" />
            <AdminStat label="Avg check-ins per person" value={stats.health.avg_checkins_per_person} color="emerald" />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-800">
            <AdminStat label="% reporting improved connection" value={`${stats.health.pct_connection}%`} color="emerald" />
          </div>
        </AdminSection>

        <AdminSection title="COMMUNITY" color="amber">
          <div className="grid grid-cols-2 gap-3">
            <AdminStat label="Total posts" value={stats.community.total_posts} color="amber" />
            <AdminStat label="Total comments" value={stats.community.total_comments} color="amber" />
            <AdminStat label="Total fist-bumps" value={stats.community.total_fists} color="amber" />
            <AdminStat label="Total messages sent" value={stats.community.total_messages} color="amber" />
          </div>
        </AdminSection>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// APP SHELL
// ---------------------------------------------------------------------------

const TABS = [
  { id: "FEED", label: "Feed", icon: Rss },
  { id: "WORKOUT", label: "Workout", icon: Dumbbell },
  { id: "CHECK-IN", label: "Check-In", icon: ClipboardCheck },
  { id: "BOARD", label: "Board", icon: Trophy },
  { id: "SQUADS", label: "Squads", icon: Users },
  { id: "MESSAGES", label: "Messages", icon: MessageCircle },
  { id: "PROFILE", label: "Profile", icon: User },
];

export default function VHIApp() {
  const [stage, setStage] = useState("onboarding");
  const [mode, setMode] = useState(null); // "demo" | "live"
  const [authChecked, setAuthChecked] = useState(false);
  const [pendingAuthUser, setPendingAuthUser] = useState(null);
  const [tab, setTab] = useState("FEED");
  const [veterans, setVeterans] = useState(INITIAL_VETERANS);
  const [squads, setSquads] = useState(INITIAL_SQUADS);
  const [currentUserId, setCurrentUserId] = useState("webb");
  const [weightHistories, setWeightHistories] = useState(DEFAULT_WEIGHT_HISTORY);
  const [goalWeights, setGoalWeights] = useState(DEFAULT_GOAL_WEIGHT);
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [feedScope, setFeedScope] = useState("battalion");
  const [threads, setThreads] = useState(INITIAL_THREADS);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [challenge, setChallenge] = useState({ ...BASE_CHALLENGE });
  const [isAdmin, setIsAdmin] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [logoTaps, setLogoTaps] = useState(0);
  const [exerciseLog, setExerciseLog] = useState(INITIAL_EXERCISE_LOG);
  const [workoutSessions, setWorkoutSessions] = useState(INITIAL_WORKOUT_SESSIONS);
  const [loggedCount, setLoggedCount] = useState(0);
  const [muscleHits, setMuscleHits] = useState({});
  const [regimenCompleted, setRegimenCompleted] = useState({});

  const currentUser = veterans.find((v) => v.id === currentUserId);
  const mySquad = currentUser ? squads.find((s) => s.id === currentUser.squadId) : squads[0];

  // Loads a real (Supabase) user + squad into app state, pulling their real
  // check-in history to rebuild the weight chart. Shared by login and by
  // restoring an existing session on page load.
  async function handleLiveLogin(veteranObj, squadObj) {
    const { data: checkinRows } = await supabase
      .from("checkins")
      .select("*")
      .eq("veteran_id", veteranObj.id)
      .order("week_number", { ascending: true });
    const weightHistory =
      checkinRows && checkinRows.length
        ? checkinRows.map((r) => ({ date: `Wk ${r.week_number}`, weight: r.weight }))
        : [{ date: "Week 0", weight: veteranObj.weightStart }];

    const { data: workoutRows } = await supabase
      .from("workouts")
      .select("*")
      .eq("veteran_id", veteranObj.id)
      .order("workout_date", { ascending: true });
    const sessionsAsc = (workoutRows || []).map((r) => ({
      id: r.id,
      date: new Date(r.workout_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      label: r.label || "Workout",
      exercises: r.exercises || [],
    }));
    const log = {};
    const hits = {};
    sessionsAsc.forEach((s) => {
      s.exercises.forEach((e) => {
        const key = (e.name || "").trim().toLowerCase();
        if (!key) return;
        log[key] = [...(log[key] || []), { date: s.date, weight: e.weight, reps: e.reps, sets: e.sets }];
        (EXERCISE_MUSCLES[e.name] || []).forEach((m) => { hits[m] = (hits[m] || 0) + 1; });
      });
    });

    setVeterans([veteranObj]);
    setSquads(squadObj ? [squadObj] : []);
    setCurrentUserId(veteranObj.id);
    setWeightHistories({ [veteranObj.id]: weightHistory });
    setGoalWeights({ [veteranObj.id]: veteranObj.goalWeight });
    // Feed and DMs aren't wired to the live backend yet — a real account
    // should start empty there. Workouts and the challenge ARE wired up now.
    setPosts([]);
    setThreads({});
    setExerciseLog(log);
    setWorkoutSessions([...sessionsAsc].reverse());
    setLoggedCount(sessionsAsc.length);
    setMuscleHits(hits);
    setRegimenCompleted({});
    setChallenge({ ...BASE_CHALLENGE, userReps: veteranObj.challengeReps || 0 });
    setMode("live");
    setStage("app");
  }

  function handleLiveJoin(veteranObj, squadObj) {
    setVeterans([veteranObj]);
    setSquads([squadObj]);
    setCurrentUserId(veteranObj.id);
    setWeightHistories({ [veteranObj.id]: [{ date: "Week 0", weight: veteranObj.weightStart }] });
    setGoalWeights({ [veteranObj.id]: veteranObj.goalWeight });
    setPosts([]);
    setThreads({});
    setExerciseLog({});
    setWorkoutSessions([]);
    setLoggedCount(0);
    setMuscleHits({});
    setRegimenCompleted({});
    setChallenge({ ...BASE_CHALLENGE });
    setMode("live");
    setStage("app");
  }

  async function handlePhotoChange(dataUrl) {
    setVeterans((prev) => prev.map((v) => (v.id === currentUserId ? { ...v, photoUrl: dataUrl } : v)));
    if (mode === "live") {
      try {
        await supabase.from("profiles").update({ avatar_url: dataUrl }).eq("id", currentUserId);
      } catch (err) {
        console.error("Failed to save profile photo:", err);
      }
    }
  }



  async function handleSignOut() {
    await supabase.auth.signOut();
    setMode(null);
    setStage("onboarding");
    setVeterans(INITIAL_VETERANS);
    setSquads(INITIAL_SQUADS);
    setCurrentUserId("webb");
    setWeightHistories(DEFAULT_WEIGHT_HISTORY);
    setGoalWeights(DEFAULT_GOAL_WEIGHT);
    setPosts(INITIAL_POSTS);
    setThreads(INITIAL_THREADS);
    setExerciseLog(INITIAL_EXERCISE_LOG);
    setWorkoutSessions(INITIAL_WORKOUT_SESSIONS);
    setLoggedCount(0);
    setMuscleHits({});
    setRegimenCompleted({});
    setChallenge({ ...BASE_CHALLENGE });
    setTab("FEED");
  }

  async function handleDeleteAccount() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return { error: "You're not signed in." };
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/delete-account`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return { error: body.error || "Something went wrong deleting your account." };
      await handleSignOut();
      return { error: null };
    } catch (err) {
      return { error: err.message || String(err) };
    }
  }

  // On first load, check whether the browser already has a logged-in
  // Supabase session (this is what lets a real user close the tab and come
  // back later without re-entering their password). Also handles the return
  // trip from a Google sign-in redirect, which lands here the same way.
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const { data: profileRow } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
        if (!active) return;
        if (profileRow) {
          const veteranObj = profileRowToVeteran(profileRow);
          const { data: squadRow } = await supabase.from("squads").select("*").eq("id", profileRow.squad_id).single();
          await handleLiveLogin(veteranObj, squadRow);
        } else if (session.user.app_metadata?.provider === "email") {
          // Email/password account whose profile write got deferred until
          // email confirmation actually happened — finish it now.
          const freshRow = await completeProfileFromMetadata(session.user.id, session.user.user_metadata || {});
          const veteranObj = profileRowToVeteran(freshRow);
          const { data: squadRow } = await supabase.from("squads").select("*").eq("id", freshRow.squad_id).single();
          await handleLiveLogin(veteranObj, squadRow);
        } else {
          // First-time Google (or other OAuth) sign-in — we only have a
          // name/email from them, not branch/state/weight/etc., so send
          // them to a short form to finish setting up before entering.
          setPendingAuthUser(session.user);
          setStage("complete-profile");
        }
      }
      if (active) setAuthChecked(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live mode: refresh the roster from the real database whenever Board or
  // Squads is opened, so the leaderboard/roster reflect real signups.
  useEffect(() => {
    if (mode !== "live") return;
    if (tab === "BOARD") {
      supabase.rpc("get_public_profiles").then(({ data, error }) => {
        if (!error && data && data.length) setVeterans(data.map(profileRowToVeteran));
      });
    }
    if (tab === "SQUADS" && currentUser) {
      supabase.rpc("get_public_profiles").then(({ data, error }) => {
        if (!error && data) setVeterans(data.filter((r) => r.squad_id === currentUser.squadId).map(profileRowToVeteran));
      });
    }
    if (tab === "FEED" && feedScope === "battalion") {
      supabase.rpc("get_challenge_stats").then(({ data, error }) => {
        if (!error && data && data[0]) {
          setChallenge((c) => ({ ...c, total: data[0].total_enrolled || c.total, completed: data[0].total_completed || 0 }));
        }
      });
    }
    if (tab === "FEED" && currentUser) {
      supabase
        .from("posts")
        .select("*")
        .or(`scope.eq.battalion,squad_id.eq.${currentUser.squadId}`)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (!error && data) setPosts(data.map(postRowToPost));
        });
    }
    if (tab === "MESSAGES") {
      supabase
        .from("messages")
        .select("*")
        .or(`sender_id.eq.${currentUserId},recipient_id.eq.${currentUserId}`)
        .order("created_at", { ascending: true })
        .then(async ({ data, error }) => {
          if (error || !data) return;
          const otherIds = [...new Set(data.map((m) => (m.sender_id === currentUserId ? m.recipient_id : m.sender_id)))];
          const profileMap = {};
          if (otherIds.length > 0) {
            const { data: publicRows } = await supabase.rpc("get_public_profiles");
            (publicRows || []).filter((r) => otherIds.includes(r.id)).forEach((r) => { profileMap[r.id] = profileRowToVeteran(r); });
          }
          const grouped = {};
          data.forEach((m) => {
            const otherId = m.sender_id === currentUserId ? m.recipient_id : m.sender_id;
            const contact = profileMap[otherId];
            if (!grouped[otherId]) {
              grouped[otherId] = {
                contact: contact ? `${contact.rank} ${contact.firstName} ${contact.lastName}` : "Unknown",
                branch: contact ? contact.branch : "ARMY",
                status: contact ? contact.status : "AMBER",
                unread: false,
                messages: [],
              };
            }
            grouped[otherId].messages.push({ from: m.sender_id === currentUserId ? "me" : "them", text: m.text, time: timeAgo(m.created_at) });
          });
          // A thread counts as unread if the most recent message in it came
          // from the other person and this isn't the thread you're currently
          // looking at.
          Object.keys(grouped).forEach((id) => {
            const msgs = grouped[id].messages;
            const last = msgs[msgs.length - 1];
            grouped[id].unread = last && last.from === "them" && id !== activeThreadId;
          });
          setThreads((prev) => {
            // Preserve a just-created, still-empty conversation stub (e.g. from
            // clicking MSG on someone you haven't messaged yet) even if the
            // fetch above doesn't have any rows for it yet.
            if (activeThreadId && !grouped[activeThreadId] && prev[activeThreadId]) {
              grouped[activeThreadId] = prev[activeThreadId];
            }
            return grouped;
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, mode, feedScope]);

  function goToMsg(id) {
    setThreads((prev) => {
      if (prev[id]) return prev;
      const member = veterans.find((v) => v.id === id);
      if (!member) return prev;
      return { ...prev, [id]: { contact: `${member.rank} ${member.firstName} ${member.lastName}`, branch: member.branch, status: member.status, unread: false, messages: [] } };
    });
    setActiveThreadId(id);
    setTab("MESSAGES");
  }

  function handleSendMessage(threadId, text) {
    setThreads((prev) => ({
      ...prev,
      [threadId]: { ...prev[threadId], messages: [...prev[threadId].messages, { from: "me", text, time: "Now" }] },
    }));
    if (mode === "live") {
      supabase.from("messages").insert({ sender_id: currentUserId, recipient_id: threadId, text }).then(({ error }) => {
        if (error) console.error("Failed to send message:", error);
      });
    }
  }

  function handleNudge(member) {
    const template =
      member.status === "RED"
        ? "Hey \u2014 saw you missed your check-in this week. You good? Here if you need anything."
        : "Hey \u2014 noticed you're a bit behind this week. Everything okay? Rooting for you.";
    setThreads((prev) => {
      const existing = prev[member.id];
      const newMsg = { from: "me", text: template, time: "Now" };
      if (existing) {
        return { ...prev, [member.id]: { ...existing, messages: [...existing.messages, newMsg] } };
      }
      return {
        ...prev,
        [member.id]: { contact: `${member.rank} ${member.firstName} ${member.lastName}`, branch: member.branch, status: member.status, unread: false, messages: [newMsg] },
      };
    });
    if (mode === "live") {
      supabase.from("messages").insert({ sender_id: currentUserId, recipient_id: member.id, text: template }).then(({ error }) => {
        if (error) console.error("Failed to send nudge:", error);
      });
    }
    setActiveThreadId(member.id);
    setTab("MESSAGES");
  }

  async function handleCheckInSubmit({ weight, goalWeight: gw, connection }) {
    const nextWeekNumber = (currentUser?.checkinsCompleted || 0) + 1;
    let newStreak = currentUser.streak + 1;
    let graceAvailable = currentUser.graceAvailable;
    let graceResetAt = currentUser.graceResetAt;
    let graceNote = null;

    if (mode === "live") {
      try {
        const today = new Date();
        // Lazy quarterly reset: if it's been 90+ days since the grace period
        // was last refreshed, restore it now rather than needing a cron job.
        const resetDate = graceResetAt ? new Date(graceResetAt) : today;
        if ((today - resetDate) / 86400000 >= 90) {
          graceAvailable = true;
          graceResetAt = today.toISOString().slice(0, 10);
        }

        const { data: lastRows } = await supabase
          .from("checkins")
          .select("checkin_date")
          .eq("veteran_id", currentUserId)
          .order("checkin_date", { ascending: false })
          .limit(1);

        if (lastRows && lastRows.length) {
          const gapDays = (today - new Date(lastRows[0].checkin_date)) / 86400000;
          if (gapDays > 21) {
            newStreak = 1;
            graceNote = "That gap was too long to protect \u2014 streak restarted at 1.";
          } else if (gapDays > 10) {
            if (graceAvailable) {
              graceAvailable = false;
              graceNote = "Grace week used \u2014 your streak is protected this time.";
            } else {
              newStreak = 1;
              graceNote = "Streak reset \u2014 your grace week was already used this quarter.";
            }
          }
        }

        await supabase.from("checkins").insert({
          veteran_id: currentUserId,
          week_number: nextWeekNumber,
          weight,
          goal_weight: gw,
          connection_improved: connection,
        });
        await supabase
          .from("profiles")
          .update({
            streak: newStreak,
            status: "GREEN",
            note: "All requirements met",
            weight_current: weight,
            goal_weight: gw,
            checkins_completed: nextWeekNumber,
            weeks_since_join: Math.max(currentUser.weeksSinceJoin, nextWeekNumber),
            connection_improved: connection,
            grace_available: graceAvailable,
            grace_reset_at: graceResetAt,
          })
          .eq("id", currentUserId);
      } catch (err) {
        console.error("Check-in failed to save to the live backend:", err);
      }
    }
    setWeightHistories((prev) => ({ ...prev, [currentUserId]: [...(prev[currentUserId] || []), { date: `Wk ${nextWeekNumber}`, weight }] }));
    setGoalWeights((prev) => ({ ...prev, [currentUserId]: gw }));
    setVeterans((prev) => prev.map((v) => (v.id === currentUserId ? { ...v, streak: newStreak, status: "GREEN", note: "All requirements met", weightCurrent: weight, checkinsCompleted: nextWeekNumber, weeksSinceJoin: Math.max(v.weeksSinceJoin, nextWeekNumber), connectionImproved: connection, graceAvailable, graceResetAt, graceNote } : v)));
  }

  // Shared sync helper: pushes a post's current text/fists/comments to
  // Supabase. Only called for rows that already exist in the DB (real
  // numeric ids from a prior insert or fetch) — locally-created posts that
  // haven't round-tripped through the DB yet are skipped, since there's
  // nothing to update there yet.
  function syncPostToSupabase(post) {
    if (mode !== "live") return;
    if (typeof post.id !== "number" || post.id >= 1e12) return; // still a local-only id, nothing to sync yet
    supabase.from("posts").update({ text: post.text, fists: post.fists, comments: post.comments }).eq("id", post.id).then(({ error }) => {
      if (error) console.error("Failed to sync post:", error);
    });
  }

  async function handleCreatePost(p) {
    setPosts((prev) => [p, ...prev]);
    if (mode === "live") {
      const { data, error } = await supabase
        .from("posts")
        .insert({ author_id: p.authorId, author_name: p.author, author_branch: p.branch, scope: p.scope, squad_id: p.squadId, text: p.text, fists: 0, comments: [] })
        .select()
        .single();
      if (!error && data) {
        setPosts((prev) => prev.map((post) => (post.id === p.id ? postRowToPost(data) : post)));
      } else if (error) {
        console.error("Failed to save post:", error);
      }
    }
  }

  function handleFistPost(id) {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, fists: p.fists + 1 } : p));
      const updated = next.find((p) => p.id === id);
      if (mode === "live" && updated) syncPostToSupabase(updated);
      return next;
    });
  }

  function handleEditPost(id, newText) {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, text: newText } : p));
      const updated = next.find((p) => p.id === id);
      if (mode === "live" && updated) syncPostToSupabase(updated);
      return next;
    });
  }

  function handleDeletePost(id) {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    if (mode === "live") {
      supabase.from("posts").delete().eq("id", id).then(({ error }) => { if (error) console.error("Failed to delete post:", error); });
    }
  }

  function handleAddComment(postId, text) {
    setPosts((prev) => {
      const next = prev.map((p) =>
        p.id === postId
          ? { ...p, comments: [...p.comments, { authorId: currentUser.id, author: `${currentUser.rank} ${currentUser.firstName} ${currentUser.lastName}`, text, time: "now", stars: 0 }] }
          : p
      );
      const updated = next.find((p) => p.id === postId);
      if (mode === "live" && updated) syncPostToSupabase(updated);
      return next;
    });
  }

  function handleEditComment(postId, idx, newText) {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === postId ? { ...p, comments: p.comments.map((c, i) => (i === idx ? { ...c, text: newText } : c)) } : p));
      const updated = next.find((p) => p.id === postId);
      if (mode === "live" && updated) syncPostToSupabase(updated);
      return next;
    });
  }

  function handleDeleteComment(postId, idx) {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === postId ? { ...p, comments: p.comments.filter((_, i) => i !== idx) } : p));
      const updated = next.find((p) => p.id === postId);
      if (mode === "live" && updated) syncPostToSupabase(updated);
      return next;
    });
  }

  function handleStarComment(postId, idx) {
    setPosts((prev) => {
      const next = prev.map((p) => (p.id === postId ? { ...p, comments: p.comments.map((c, i) => (i === idx ? { ...c, stars: (c.stars || 0) + 1 } : c)) } : p));
      const updated = next.find((p) => p.id === postId);
      if (mode === "live" && updated) syncPostToSupabase(updated);
      return next;
    });
  }

  function handleLogReps(amount) {
    setChallenge((c) => {
      const nextReps = c.userReps + amount;
      if (mode === "live") {
        supabase.from("profiles").update({ challenge_reps: nextReps }).eq("id", currentUserId).then(({ error }) => {
          if (error) console.error("Failed to save challenge reps:", error);
        });
        return { ...c, userReps: nextReps };
      }
      const wasComplete = c.userReps >= 100;
      const nowComplete = nextReps >= 100;
      return { ...c, userReps: nextReps, completed: nowComplete && !wasComplete ? Math.min(c.total, c.completed + 1) : c.completed };
    });
  }

  function handleLogWorkout(entries, day, label) {
    const date = todayLabel();
    setExerciseLog((prev) => {
      const next = { ...prev };
      entries.forEach((e) => {
        const key = e.name.trim().toLowerCase();
        const entry = { date, weight: Number(e.weight) || 0, reps: Number(e.reps) || 0, sets: Number(e.sets) || 1 };
        next[key] = [...(next[key] || []), entry];
      });
      return next;
    });
    setMuscleHits((prev) => {
      const next = { ...prev };
      entries.forEach((e) => {
        const muscles = EXERCISE_MUSCLES[e.name] || [];
        muscles.forEach((m) => { next[m] = (next[m] || 0) + 1; });
      });
      return next;
    });
    const session = { id: Date.now(), date, label: label || "Custom Workout", exercises: entries.map((e) => ({ name: e.name, weight: Number(e.weight) || 0, reps: Number(e.reps) || 0, sets: Number(e.sets) || 1 })) };
    setWorkoutSessions((prev) => [session, ...prev]);
    setLoggedCount((c) => c + 1);
    if (day) setRegimenCompleted((prev) => ({ ...prev, [day]: true }));
    if (mode === "live") {
      supabase
        .from("workouts")
        .insert({ veteran_id: currentUserId, workout_date: new Date().toISOString().slice(0, 10), label: session.label, exercises: session.exercises })
        .then(({ error }) => { if (error) console.error("Failed to save workout:", error); });
    }
  }

  function handleDemoEntry() {
    setVeterans(INITIAL_VETERANS);
    setSquads(INITIAL_SQUADS);
    setCurrentUserId("webb");
    setWeightHistories(DEFAULT_WEIGHT_HISTORY);
    setGoalWeights(DEFAULT_GOAL_WEIGHT);
    setPosts(INITIAL_POSTS);
    setThreads(INITIAL_THREADS);
    setExerciseLog(INITIAL_EXERCISE_LOG);
    setWorkoutSessions(INITIAL_WORKOUT_SESSIONS);
    setLoggedCount(0);
    setMuscleHits({});
    setRegimenCompleted({});
    setChallenge({ ...BASE_CHALLENGE });
    setMode("demo");
    setStage("app");
  }

  function handleLogoTap() {
    if (mode === "live" && !currentUser?.isAdmin) return;
    const next = logoTaps + 1;
    if (next >= 5) { setIsAdmin(true); setLogoTaps(0); } else { setLogoTaps(next); }
  }

  const globalStyle = (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&family=Archivo:wght@400;500;600;700&display=swap');
      .font-display { font-family: 'Oswald', sans-serif; text-transform: uppercase; }
      .font-body { font-family: 'Archivo', sans-serif; text-transform: none; }
    `}</style>
  );

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center">
        {globalStyle}
        <div className="w-full max-w-lg bg-white min-h-screen shadow-xl flex items-center justify-center">
          <div className="font-display text-sm tracking-widest text-gray-400">LOADING VHI&hellip;</div>
        </div>
      </div>
    );
  }

  if (stage === "onboarding") {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center">
        {globalStyle}
        <div className="w-full max-w-lg bg-white min-h-screen shadow-xl">
          <Onboarding onDemo={handleDemoEntry} onJoin={handleLiveJoin} onLogin={handleLiveLogin} />
        </div>
      </div>
    );
  }

  if (stage === "complete-profile" && pendingAuthUser) {
    return (
      <div className="min-h-screen bg-gray-100 flex justify-center">
        {globalStyle}
        <div className="w-full max-w-lg bg-white min-h-screen shadow-xl">
          <CompleteProfile authUser={pendingAuthUser} onComplete={(veteranObj, squad) => { setPendingAuthUser(null); handleLiveJoin(veteranObj, squad); }} />
        </div>
      </div>
    );
  }

  if (!currentUser || !mySquad) return null;

  const weightHistory = weightHistories[currentUserId] || [{ date: "Week 0", weight: currentUser.weightCurrent }];
  const goalWeight = goalWeights[currentUserId] || currentUser.weightCurrent;
  const muscles = { ...(mode === "live" ? MUSCLE_ZERO : MUSCLE_BASE) };
  Object.entries(muscleHits).forEach(([m, n]) => { muscles[m] = (muscles[m] || 0) + n; });
  const workoutStats =
    mode === "live"
      ? { total: loggedCount, streak: currentUser.streak, bench: 0, squat: 0, deadlift: 0, muscles }
      : { total: 42 + loggedCount, streak: 7, bench: 225, squat: 315, deadlift: 405, muscles };

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center">
      {globalStyle}
      <div className="w-full max-w-lg bg-white min-h-screen shadow-xl relative">
        {isAdmin && <AdminDashboard veterans={veterans} squads={squads} posts={posts} threads={threads} mode={mode} onClose={() => setIsAdmin(false)} />}

        <header className="sticky top-0 z-10 bg-black text-white">
          <div className="px-5 pt-5 pb-3 flex justify-between items-start">
            <button onClick={handleLogoTap} className="text-left">
              <div className="flex items-center gap-2">
                <div className="font-display text-2xl tracking-tight leading-none">VHI</div>
                <span className={`font-display text-[9px] tracking-widest px-1.5 py-0.5 rounded border ${mode === "live" ? "border-emerald-500 text-emerald-400" : "border-gray-500 text-gray-400"}`}>
                  {mode === "live" ? "LIVE" : "DEMO"}
                </span>
              </div>
              <div className="font-display text-[10px] tracking-widest text-gray-400 mt-1">SQUAD-BASED ACCOUNTABILITY</div>
            </button>
            <div className="flex items-start gap-3">
              <div className="relative">
                <button onClick={() => setShowNotifications((s) => !s)} className="relative p-1" aria-label="Notifications">
                  <Bell size={20} />
                  {Object.values(threads).some((t) => t.unread) && <span className="absolute top-0 right-0 w-2 h-2 rounded-full bg-red-600" />}
                </button>
                {showNotifications && (
                  <div className="absolute right-0 top-8 w-64 bg-white text-black rounded-lg shadow-xl overflow-hidden z-20">
                    <div className="font-display text-xs tracking-widest text-gray-400 px-3 py-2 border-b border-gray-100">NOTIFICATIONS</div>
                    {Object.entries(threads).filter(([, t]) => t.unread).length === 0 ? (
                      <div className="font-body text-sm text-gray-400 px-3 py-4 text-center">You're all caught up.</div>
                    ) : (
                      Object.entries(threads)
                        .filter(([, t]) => t.unread)
                        .map(([id, t]) => (
                          <button
                            key={id}
                            onClick={() => {
                              setShowNotifications(false);
                              setThreads((prev) => ({ ...prev, [id]: { ...prev[id], unread: false } }));
                              setActiveThreadId(id);
                              setTab("MESSAGES");
                            }}
                            className="w-full text-left px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50"
                          >
                            <div className="font-body text-sm font-semibold">{t.contact}</div>
                            <div className="font-body text-xs text-gray-500 truncate">{t.messages[t.messages.length - 1]?.text}</div>
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
              <div className="text-right">
                <StatusBadge status={currentUser.status} />
                <div className="font-body text-xs text-gray-400 mt-1">{squadDisplayName(mySquad)}</div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-5 py-6 pb-28">
          {tab === "FEED" && (
            <Feed
              posts={posts}
              onPost={handleCreatePost}
              onFist={handleFistPost}
              onComment={handleAddComment}
              onEditPost={handleEditPost}
              onDeletePost={handleDeletePost}
              onEditComment={handleEditComment}
              onDeleteComment={handleDeleteComment}
              onStarComment={handleStarComment}
              currentUser={currentUser}
              mySquad={mySquad}
              veterans={veterans}
              challenge={challenge}
              onLogReps={handleLogReps}
              scope={feedScope}
              setScope={setFeedScope}
            />
          )}
          {tab === "WORKOUT" && (
            <Workout stats={workoutStats} exerciseLog={exerciseLog} regimenCompleted={regimenCompleted} onLogWorkout={handleLogWorkout} showDemoData={mode !== "live"} />
          )}
          {tab === "CHECK-IN" && <CheckIn currentUser={currentUser} weightHistory={weightHistory} goalWeight={goalWeight} onSubmit={handleCheckInSubmit} />}
          {tab === "BOARD" && <Board veterans={veterans} currentUser={currentUser} mySquad={mySquad} onMsg={goToMsg} />}
          {tab === "SQUADS" && <Squads veterans={veterans} currentUser={currentUser} mySquad={mySquad} onMsg={goToMsg} onNudge={handleNudge} />}
          {tab === "MESSAGES" && <Messages threads={threads} setThreads={setThreads} activeThreadId={activeThreadId} setActiveThreadId={setActiveThreadId} onSend={handleSendMessage} />}
          {tab === "PROFILE" && (
            <Profile
              user={currentUser}
              mySquad={mySquad}
              weightHistory={weightHistory}
              goalWeight={goalWeight}
              workoutSessions={workoutSessions}
              onSignOut={mode === "live" ? handleSignOut : undefined}
              onPhotoChange={handlePhotoChange}
              onDeleteAccount={mode === "live" ? handleDeleteAccount : undefined}
              onOpenAdmin={() => setIsAdmin(true)}
            />
          )}
        </main>

        <nav className="fixed bottom-0 left-0 right-0 max-w-lg mx-auto bg-black border-t border-gray-800 grid grid-cols-7" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const hasUnread = t.id === "MESSAGES" && Object.values(threads).some((th) => th.unread);
            return (
              <button key={t.id} onClick={() => { setTab(t.id); if (t.id !== "MESSAGES") setActiveThreadId(null); }} className="relative flex flex-col items-center justify-center py-2.5 gap-1">
                <Icon size={18} className={active ? "text-white" : "text-gray-500"} />
                <span className={`font-display text-[8px] tracking-wide leading-none ${active ? "text-white" : "text-gray-500"}`}>{t.label}</span>
                {hasUnread && <span className="absolute top-1.5 right-1/2 translate-x-3 w-2 h-2 rounded-full bg-red-600" />}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
