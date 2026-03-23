export interface PromptProvider {
    name: string;
    rating: number;
    ratingCount: number;
    services?: { full: string }[];
    isFavourite?: boolean;
    favouriteReason?: string;
}

export interface PromptPreviousDiagnosis {
    diagnosis?: string;
    trade?: string;
    trade_detail?: string;
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
