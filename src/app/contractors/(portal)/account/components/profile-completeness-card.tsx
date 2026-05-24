import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
    computeProfileCompletenessActions,
    profileCompletenessSteps,
    type ProfileCompletenessInput,
} from '@/lib/providers/profile-completeness-actions';

export interface ProfileCompletenessCardProps {
    score: number | null | undefined;
    input: ProfileCompletenessInput;
    /** Optional link to edit the profile (e.g. /contractors/account/edit). */
    editHref?: string;
}

export function ProfileCompletenessCard({ score, input, editHref }: ProfileCompletenessCardProps) {
    const { completed, total, percent } = profileCompletenessSteps(score);
    const actions = computeProfileCompletenessActions(input);
    const allDone = actions.length === 0;

    return (
        <Card>
            <CardHeader>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-1">
                        <CardTitle>Profile completeness</CardTitle>
                        <CardDescription>
                            {allDone
                                ? 'Your profile is fully populated — nothing else to do.'
                                : 'Knock these out to climb the ranking and get matched more often.'}
                        </CardDescription>
                    </div>
                    <div className="shrink-0 text-right">
                        <p className="text-2xl font-semibold text-foreground">
                            {completed}/{total}
                        </p>
                        <p className="text-xs text-muted-foreground">{percent}% complete</p>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
                <Progress value={percent} />

                {actions.length > 0 ? (
                    <ol className="flex flex-col gap-3" aria-label="Profile upgrade actions">
                        {actions.map((action) => (
                            <li
                                key={action.id}
                                className="flex gap-3 rounded-md border border-input bg-card p-3"
                            >
                                <div
                                    aria-hidden="true"
                                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-input text-xs font-medium text-muted-foreground"
                                >
                                    {action.priority}
                                </div>
                                <div className="flex flex-col gap-1">
                                    <p className="text-sm font-medium text-foreground">
                                        {action.title}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {action.description}
                                    </p>
                                </div>
                            </li>
                        ))}
                    </ol>
                ) : null}

                {editHref ? (
                    <a
                        href={editHref}
                        className="text-sm font-medium text-foreground underline underline-offset-4 hover:no-underline"
                    >
                        Edit profile
                    </a>
                ) : null}
            </CardContent>
        </Card>
    );
}
