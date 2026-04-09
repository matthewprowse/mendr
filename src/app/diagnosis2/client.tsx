'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ScanFlowShell } from '@/components/scan-flow-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Download, Share2 } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

type MockDiagnosis = {
    headline: string;
    thought: string;
    detail: string;
    hazard: string;
    trade: string;
    tradeDetail: string;
    urgencyKey: 'immediate' | 'urgent' | 'soon' | 'planned';
    urgencyLabel: string;
};

const MOCK: MockDiagnosis = {
    headline: 'Active Ceiling Water Leak',
    thought:
        'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    detail:
        "Specialists should inspect the area above the leak to determine the exact source, whether it is a burst pipe, a faulty fitting, or a roof penetration. Repairing the leak immediately prevents further water damage and potential structural issues.",
    hazard:
        'If there is any electrical wiring near the leak, switch off power to the affected area and avoid contact with wet fittings.',
    trade: 'Plumbing',
    tradeDetail: 'Leak Detection & Repair',
    urgencyKey: 'urgent',
    urgencyLabel: 'Urgent',
};

const MOCK_ADDED_DETAILS = [
    {
        source: '1',
        text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
    {
        source: '2',
        text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    },
] as const;

export default function Diagnosis2PageClient() {
    const router = useRouter();
    const footerRef = useRef<HTMLDivElement | null>(null);

    const [isAddingInfo, setIsAddingInfo] = useState(false);
    const [infoText, setInfoText] = useState('');
    const [mockNeedsMoreDetail] = useState(false);
    const [isMoreInfoExpanded, setIsMoreInfoExpanded] = useState(mockNeedsMoreDetail);
    const [mockMoreDetail, setMockMoreDetail] = useState('');

    const [mock] = useState<MockDiagnosis>(MOCK);

    const footer = !isAddingInfo ? (
        <div className="flex flex-row gap-4 justify-end">
            <Button
                type="button"
                variant="ghost"
                className="h-10 flex-1"
                disabled={!mockMoreDetail.trim()}
            >
                Re-Scan Report
            </Button>
            <Button type="button" className="h-10 flex-1" onClick={() => router.push('/match/mock')}>
                Find Contractors
            </Button>
        </div>
    ) : (
        <div className="flex flex-col gap-3">
            <Label htmlFor="diagnosis2-info">Add More Detail</Label>
            <Textarea
                id="diagnosis2-info"
                value={infoText}
                onChange={(e) => setInfoText(e.target.value)}
                className="h-18 w-full"
                rows={3}
            />
            <div className="flex gap-2">
                <Button
                    type="button"
                    variant="outline"
                    className="h-10 flex-1"
                    onClick={() => {
                        setIsAddingInfo(false);
                        setInfoText('');
                        setIsMoreInfoExpanded(false);
                    }}
                >
                    Cancel
                </Button>
                <Button
                    type="button"
                    className="h-10 flex-1"
                    disabled={!infoText.trim()}
                    onClick={() => {
                        // Mock action; keep UI editable without side effects.
                        setIsAddingInfo(false);
                        setIsMoreInfoExpanded(false);
                    }}
                >
                    Update Report
                </Button>
            </div>
        </div>
    );

    return (
        <ScanFlowShell
            headerRight={
                <div className="flex flex-row gap-4">
                    <Button type="button" variant="secondary" size="icon" className="h-10 w-10">
                        <Share2 size={24} />
                    </Button>
                    <Button type="button" variant="secondary" size="icon" className="h-10 w-10">
                        <Download size={24} />
                    </Button>
                </div>
            }
            footerRef={footerRef}
            contentBottomPadding={88}
            constrainContentWidth
            footer={footer}
        >
            <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Your Scandio Report</h1>
                <p className="text-sm text-muted-foreground">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                </p>
            </div>

            <div className="flex flex-col gap-2">
                {MOCK_ADDED_DETAILS.map((item) => (
                    <div
                        key={item.source}
                        className="w-fit rounded-md bg-background px-3 py-2"
                    >
                        <p className="text-xs text-foreground">{item.text}</p>
                    </div>
                ))}
            </div>

            <div className="flex flex-col gap-6 rounded-lg border border-border/50 bg-background p-6 text-left">
            <div className="flex flex-col gap-4">
                <div className="flex flex-row items-center justify-between">
                    <h2 className="text-lg font-bold text-foreground">{mock.headline}</h2>
                    <Badge variant="secondary">{mock.trade}</Badge>
                </div>
                <div className="flex flex-col gap-4">
                    <div className="h-48 w-full rounded-lg border border-border bg-secondary object-cover" />
                    <p className="text-xs text-muted-foreground">{mock.thought}</p>
                </div>
            </div>
            
            <Separator />

            <div className="flex flex-col gap-4">
                <p className="text-sm text-foreground">{mock.detail}</p>
                <p className="text-sm text-foreground">{mock.hazard}</p>
            </div>
            </div>

            {isMoreInfoExpanded ? (
                <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-background p-6 text-left">
                    <Label>Add More Information</Label>
                    <Textarea
                        className="min-h-18 max-h-24"
                        value={mockMoreDetail}
                        onChange={(e) => setMockMoreDetail(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                    </p>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setIsMoreInfoExpanded(true)}
                    className="flex flex-row items-center justify-between rounded-lg border border-border/50 bg-background px-6 py-3.5 text-left"
                >
                    <p className="text-sm text-muted-foreground">Did We Miss Something?</p>
                    <p className="text-sm font-medium text-foreground">Add Information</p>
                </button>
            )}
        </ScanFlowShell>
    );
}

