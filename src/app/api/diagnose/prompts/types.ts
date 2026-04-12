export interface PromptProvider {
    name: string;
    rating: number;
    ratingCount: number;
    specialisations?: string[];
    isFavourite?: boolean;
    favouriteReason?: string;
    /** Driving or straight-line distance when known, e.g. "12 km" */
    distanceText?: string;
    /** Short area hint (suburb or truncated address) for reassurance */
    areaHint?: string;
}

export interface PromptPreviousDiagnosis {
    diagnosis?: string;
    trade?: string;
    trade_detail?: string;
    /** Used on provider-hydration turns to preserve report substance */
    message?: string;
    action_required?: string;
    estimated_cost?: string;
}

export interface PromptUserSelectedTrade {
    diagnosis: string;
    trade: string;
}

export interface PromptContext {
    isFollowUp: boolean;
    hasUserContext: boolean;
    userSelectedTrade?: PromptUserSelectedTrade | null;
    isTextOnlyNoAttachments: boolean;
    serviceListText: string;
    feedback?: string;
    providers?: PromptProvider[];
    previousDiagnosis?: PromptPreviousDiagnosis | null;
    diagnosisRejected?: boolean;
}
