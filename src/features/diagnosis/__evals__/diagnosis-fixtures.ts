/**
 * Fixture set for the diagnostic-accuracy eval.
 *
 * Real-world SA home faults paired with the canonical trade the classifier
 * should land on. Every `expectedTrade` MUST be a member of SERVICE_LABELS —
 * the drift guard in `__tests__/diagnosis-fixtures.test.ts` fails the build if
 * one rots, which is exactly the taxonomy drift the deleted harness once
 * caught.
 *
 * Keep descriptions in a homeowner's own words (not trade jargon) — the eval
 * is only meaningful if the inputs look like what real users type.
 */
import type { DiagnosisEvalFixture } from './accuracy';

export const DIAGNOSIS_EVAL_FIXTURES: DiagnosisEvalFixture[] = [
    {
        id: 'geyser-relief-valve',
        description:
            'Water keeps dripping from the overflow pipe outside near my geyser and the hot water has gone weak.',
        expectedTrade: 'Plumbing',
        note: 'Classic geyser pressure-relief fault — the golden-path canonical case.',
    },
    {
        id: 'tripping-db-board',
        description:
            'My power keeps tripping every time I switch on the kettle. The trip switch in the DB board flips and I have to reset it.',
        expectedTrade: 'Electrical',
        note: 'Earth-leakage / overload — must not bleed into Appliance Repair.',
    },
    {
        id: 'leaking-roof-ceiling-stain',
        description:
            'After the rain last night there is a brown water stain spreading on my ceiling and a drip in the corner of the bedroom.',
        expectedTrade: 'Roofing',
        note: 'Roof ingress vs Waterproofing boundary — ceiling drip reads as Roofing.',
    },
    {
        id: 'damp-rising-wall',
        description:
            'The paint on my inside wall is bubbling and there is a damp tide mark rising up from the skirting board.',
        expectedTrade: 'Waterproofing',
        note: 'Rising/penetrating damp — distinct from a roof leak.',
    },
    {
        id: 'gate-motor-dead',
        description:
            'My automatic driveway gate stopped working completely, the remote does nothing and there is no light on the motor.',
        expectedTrade: 'Security',
        note: 'Gate motor / access automation sits under Security in the taxonomy.',
    },
    {
        id: 'aircon-not-cooling',
        description:
            'The air conditioner in my lounge runs but only blows warm air and there is ice forming on the pipe outside.',
        expectedTrade: 'Air Conditioning',
    },
    {
        id: 'blocked-drain-outside',
        description:
            'The outside drain by my kitchen is overflowing with dirty water and there is a bad smell coming up.',
        expectedTrade: 'Plumbing',
        note: 'Blocked drain — Plumbing, not Rubble & Waste Removal.',
    },
    {
        id: 'cracked-wall-structural',
        description:
            'A diagonal crack has appeared above my door frame and it seems to be getting wider over the last few weeks.',
        expectedTrade: 'Building & Construction',
    },
    {
        id: 'broken-window-pane',
        description:
            'A pane in my aluminium sliding window cracked and one side no longer slides properly in the track.',
        expectedTrade: 'Glazing, Glass & Aluminium',
    },
    {
        id: 'pool-green-pump',
        description:
            'My pool has turned green and the pump makes a loud humming noise but the water is not circulating.',
        expectedTrade: 'Pool Maintenance',
    },
    {
        id: 'fridge-not-cold',
        description:
            'My fridge stopped getting cold, the freezer defrosted overnight and the motor at the back feels very hot.',
        expectedTrade: 'Appliance Repair',
        note: 'Appliance, not Electrical — even though it is electrical in nature.',
    },
    {
        id: 'locked-out-jammed-lock',
        description:
            'My front door key turns but the lock will not open, it feels like the mechanism inside is jammed and I am locked out.',
        expectedTrade: 'Locksmith Services',
    },
    {
        id: 'solar-inverter-fault',
        description:
            'My solar backup system is showing a red fault light on the inverter and the batteries are not charging during load-shedding.',
        expectedTrade: 'Solar & Backup Power',
    },
    {
        id: 'gas-stove-smell',
        description:
            'I can smell gas near my hob and the flame keeps going out, I am worried about a leak on the gas connection.',
        expectedTrade: 'Gas Installation & Repair',
    },
    {
        id: 'borehole-no-water',
        description:
            'My borehole pump was working fine but now no water comes through to the tank and the pump keeps cutting out.',
        expectedTrade: 'Borehole, Water & Pumps',
    },
];
