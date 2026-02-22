"use client";

import { Button } from "@/components/ui/button";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { setLocation } from "@/lib/location-store";
import { setImageData } from "@/lib/image-store";
import { compressImage } from "@/lib/image-compression";
import { toast } from "sonner";

const isMobile = () =>
    typeof navigator !== "undefined" &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function createConversationId(): string {
    return typeof crypto?.randomUUID === "function"
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).substring(2);
}

const MAX_FILE_SIZE_MB = 20;

export default function Home() {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [locationReady, setLocationReady] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const router = useRouter();

    const requestLocation = () => {
        if (typeof window !== "undefined" && !window.isSecureContext) return;
        if (typeof navigator === "undefined" || !navigator.geolocation) return;
        const promise = new Promise<void>((resolve) => {
            const done = () => {
                setLocationReady(true);
                resolve();
            };
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    done();
                },
                done,
                { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 }
            );
            setTimeout(done, 16000);
        });
    };

    const triggerFileUpload = () => {
        fileInputRef.current?.click();
    };

    const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");
        if (!isImage && !isVideo) {
            toast.error("Please upload an image or video.");
            return;
        }

        if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            toast.error(`File must be under ${MAX_FILE_SIZE_MB}MB.`);
            return;
        }

        setIsProcessing(true);
        requestLocation();

        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const finalDataUrl = isImage ? await compressImage(dataUrl) : dataUrl;
            const conversationId = createConversationId();
            setImageData(conversationId, finalDataUrl, file.name);
            router.push(`/chat/${conversationId}`);
        } catch (err) {
            console.error("File processing failed:", err);
            toast.error("Failed to process file. Please try again.");
        } finally {
            setIsProcessing(false);
        }
    };

    const insecureContext =
        typeof window !== "undefined" && !window.isSecureContext && isMobile();

    return (
        <div className="flex flex-col justify-center items-center min-h-screen bg-background gap-6 px-4">
            {insecureContext && (
                <p className="text-sm text-amber-600 dark:text-amber-500 text-center max-w-md">
                    Location requires HTTPS. Open this app via https:// (not http://) for
                    location to work on mobile.
                </p>
            )}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileSelected}
            />
            <div className="flex flex-col items-center gap-4 w-full justify-center">
                {isMobile() ? (
                    <>
                        {!locationReady ? (
                            <Button
                                variant="secondary"
                                className="min-w-[164px]"
                                onClick={requestLocation}
                                disabled={!!insecureContext}
                            >
                                1. Enable Location
                            </Button>
                        ) : (
                            <Button
                                variant="secondary"
                                className="min-w-[164px]"
                                onClick={triggerFileUpload}
                                disabled={!!insecureContext || isProcessing}
                            >
                                {isProcessing ? "Processing…" : "2. Diagnose Issue"}
                            </Button>
                        )}
                    </>
                ) : (
                    <Button
                        variant="secondary"
                        onClick={triggerFileUpload}
                        disabled={isProcessing}
                    >
                        {isProcessing ? "Processing…" : "Diagnose Issue"}
                    </Button>
                )}
                <Button variant="ghost">
                    View Sample Report
                </Button>
            </div>
        </div>
    );
}
