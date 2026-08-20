# Research gaps

This is the human-readable companion to `research-gaps.json`, which the
application reads programmatically. It records, deliberately, what this
research pass did **not** manage to establish — a named person who was
searched for and not found is not the same thing as a person who does not
exist, and a squad name that was not researched in depth is not the same
thing as a gap in the squad itself. Surfacing these explicitly is preferred
over silently omitting them.

Grouped below by why the gap exists. All notes are as recorded by the
research groups at the time of research (2026-08-20).

## Named but not a confirmed Republic of Ireland-eligible player

- **Brian Keeley** — no evidence of a distinct ROI-eligible footballer with
  this name; the only close match in the Ireland goalkeeping setup is Josh
  Keeley (Luton Town). Not merged in, to avoid conflating two people.
- **Nathan McGinty** — no evidence of an ROI-eligible defender with this
  name; the closest match, Ed McGinty, is a different position (goalkeeper)
  and may be a different person.
- **Odin Bailey** — confirmed to be an English footballer (Stockport
  County) with no found evidence of ROI eligibility, and not a defender.
- **Cameron Dunne** — no evidence found of an ROI-eligible defender with
  this name at Manchester City or elsewhere.

## Named but excluded by the research brief's own scope rules

- **Rocco Vata** — plays as a winger/forward, not a defender; the brief for
  this group asked for defenders only. (He is included in the dataset via
  a different group's research, as a forward.)
- **Kasey McAteer** — primarily a winger/forward, not midfield-listed as
  the brief for this group required.
- **Sinclair Armstrong**, **Tom Cannon** — forwards; the assigned brief for
  this group asked to skip forwards.
- **Will Ferry** — primarily a left-back/wing-back, not a forward or
  winger as the assigned brief required.

## Named in a squad list but not researched to a standard fit for inclusion

These players were confirmed to exist and to have some Ireland squad
connection, but time constraints in this research pass meant they could not
be verified to the standard the rest of the dataset holds to:

- **Will Smallbone** (Southampton, on loan at Millwall, injury-disrupted
  2025-26) — known prior senior involvement; recommended for follow-up.
- **Josh Honohan** (moved Shamrock Rovers → Lincoln City for a reported
  £500,000 on 1 January 2026; prior senior call-ups) — not found in the
  March or May 2026 confirmed squad lists checked; recommended for
  follow-up.
- **Jaden Umeh** and **Jack Moylan** — discovered as attackers named in the
  May/June 2026 squad while researching a different group's remit, but not
  assigned players for that group and not researched in depth.
- Eleven U21 squad members named in the June 2026 FAI U21 squad
  announcement but not reached before the research budget for that group
  ran out: **David Okagbue** (Peterborough United), **Cillian Murphy**
  (Cork City), **Darius Lipsiuc** (Stoke City — only a prior August 2025
  loan listing at Solihull Moors found incidentally), **Harry Vaughan**
  (Bohemians, on loan from Hull City), **Jamie Mullins** (Wycombe
  Wanderers), **Kian McMahon Brown** (Burnley), **Aaron Maguire**
  (Tottenham Hotspur), **Jacob Devaney** (Manchester United), **Rory
  Finneran** (Newcastle United), **Naj Razi** (Shamrock Rovers), **Sean
  Keogh** (Brighton & Hove Albion), **Oisin Gallagher** (Lincoln City),
  **Conor Walsh** (Shelbourne).

## Ambiguous names resolved to a specific player

- **"Joshua Ndaba"** in the original brief did not match any known player;
  the closest match in the FAI's May 2026 squad announcement is **Corrie
  Ndaba** (Lecce), who received his first senior call-up around that time.
  Recorded in the dataset as `corrie-ndaba`, with a disambiguation note.
- **"Justin Devoy"** likewise did not match; the closest match is **Dawson
  Devoy** (Bohemians captain). Recorded as `dawson-devoy`, with a
  disambiguation note.

## Squad status noted but not independently confirmed

- **Andrew Omobamidele** — included as a full player entry, but flagged
  because he was not named in either the March 2026 play-off squad or the
  May 2026 Qatar/Canada friendly squad obtained in this research, despite
  positive reporting on his club form at Strasbourg. His senior-squad
  standing as of August 2026 could not be independently confirmed beyond
  those two squad lists.
- **Josh Murphy** (Portsmouth, born 1995) — holds Irish citizenship
  eligibility per available reporting, but no evidence was found of any
  Republic of Ireland call-up, squad inclusion, or public FAI interest.
  Omitted for lack of a confirmed national-team connection.

## Squad and fixture context (not player-specific)

The U21 squad for the relevant window was announced **2026-06-01**. The
senior team's next confirmed competition is the **UEFA Nations League
2026-27** (League B, Group B3, against Israel, Austria and Kosovo), used as
preparation for **UEFA Euro 2028**, which Ireland co-hosts with the UK.
Ireland were eliminated from the 2026 World Cup by Czechia in a play-off
(2-2, 4-3 on penalties) on 26 March 2026.

Known fixtures at the time of research: **Kosovo (away)**, 2026-09-24, and
**Israel (away)**, 2026-09-27, both UEFA Nations League Group B3; further
Group B3 fixtures against Israel, Austria and Kosovo run to 17 November
2026 per RTÉ's reporting of the fixture calendar.

The most recent confirmed senior squad announcements found were the 5 May
2026 squad for a friendly against Grenada (16 May 2026, seven first
call-ups including Jaden Umeh, Eiran Cashin and Tayo Adaramola) and a 25 May
2026 update for friendlies against Qatar (28 May 2026, home) and Canada
(5 June 2026, away), in which Jaden Umeh and Mason Melia earned senior
debuts. As of 20 August 2026, no squad had yet been named for the September
2026 Nations League opener — consistent with the squad window not
traditionally opening until late September.

## What this means for the dataset

None of the above gaps were filled with a guess. Where a player could not
be confirmed to exist, they are absent from `irish-players-research.json`
entirely. Where a player exists but could not be researched fully, they are
named here rather than included with invented detail. This list, together
with each player's own `unverified` field, is the honest account of where
this snapshot's confidence runs out.
