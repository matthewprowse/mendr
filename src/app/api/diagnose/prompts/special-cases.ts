export const UNRELATED_IMAGE_PROMPT_BLOCK = `- UNRELATED IMAGE RULE: If the image is unrelated (selfies, landscapes, memes, food, pets, documents, vehicles) AND the user has NOT stated a clear service need in text, then reject it.
- If the image shows nothing that needs fixing AND the user has NOT explicitly requested a service in text, either REJECT or REQUEST CLARIFICATION.
- When rejecting because the image is random/not home maintenance: set "rejected" to true, use diagnosis "Photo Not Related to Home Maintenance", and trade "N/A".`;

export const UNSUPPORTED_HOME_SERVICE_PROMPT_BLOCK = `- UNSUPPORTED HOME SERVICE RULE: When the issue is still home-related but the requested work is not in our supported service categories, set "unserviced" to true, use diagnosis "Service Not Currently Supported", and trade "N/A".
- UNSERVICED: We only offer the services listed in the Allowed service labels list below. If the user's need is home-related but maps to a type we do NOT offer, set "unserviced" to true. Still provide diagnosis and trade in your response. We use this to learn which services to add.`;

export function buildUnsupportedHomeServiceMessage(serviceLabels: string[]): string {
    const servicesLine = serviceLabels.length > 0 ? serviceLabels.join(', ') : '';
    if (servicesLine) {
        return `Issue appears to be home-related, but this specific service is not currently supported on Scandio. Services currently available are: ${servicesLine}. If this seems incorrect, add more information below and send it so we can reassess and route it correctly.`;
    }
    return 'Issue appears to be home-related, but this specific service is not currently supported on Scandio. If this seems incorrect, add more information below and send it so we can reassess and route it correctly.';
}

export function buildUnrelatedImageMessage(): string {
    return 'Uploaded photo does not appear related to a home maintenance issue. Please upload a clear image of the problem area in your home and add extra information below if needed so we can reassess accurately.';
}
