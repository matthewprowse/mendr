 "use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { compressImage } from "@/lib/image-compression";
import { setImageData } from "@/lib/image-store";
import { createClientId } from "@/lib/client-random-id";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { importLibrary } from "@googlemaps/js-api-loader";
import { ensureGoogleMapsLoaderOptions } from "@/lib/google-maps-js-loader";
import { MapPin } from "lucide-react";
import { ScanFlowShell } from "@/components/scan-flow-shell";
import { patchConversation } from "@/lib/diagnoses-api";
import { X } from "@phosphor-icons/react";

export default function WelcomePageClient() {
    const router = useRouter();
    const [expandedCard, setExpandedCard] = useState<"happening" | "where">("happening");
    const [services, setServices] = useState<string[]>([]);
    const [selectedService, setSelectedService] = useState<string | null>(null);
    const [isLoadingServices, setIsLoadingServices] = useState(true);
    const [locationValue, setLocationValue] = useState("");
    const [isGettingLocation, setIsGettingLocation] = useState(false);
    const [welcomeInfoText, setWelcomeInfoText] = useState("");
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
    const [photoFileName, setPhotoFileName] = useState<string | null>(null);
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [isStartingDiagnosis, setIsStartingDiagnosis] = useState(false);
    const photoInputRef = useRef<HTMLInputElement | null>(null);
    const locationInputRef = useRef<HTMLInputElement | null>(null);
    const geocoderRef = useRef<any>(null);
    const supabase = getSupabase();
    const suggestedDestinations = [
        {
            id: "nearby",
            title: "Nearby",
            subtitle: "Find what's around you",
            value: "",
            useCurrentLocation: true,
        },
        {
            id: "sea-point",
            title: "Stellenbosch",
            subtitle: "Atlantic Seaboard",
            value: "Stellenbosch, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "gardens",
            title: "Paarl",
            subtitle: "City Bowl area",
            value: "Paarl, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "claremont",
            title: "Franschhoek",
            subtitle: "Southern Suburbs",
            value: "Franschhoek, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "bloubergstrand",
            title: "Hermanus",
            subtitle: "West Coast side",
            value: "Hermanus, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "george",
            title: "George",
            subtitle: "Garden Route",
            value: "George, Western Cape",
            useCurrentLocation: false,
        },
    ] as const;

    const truncateFileNameKeepExtension = (fileName: string, maxBaseLength = 20) => {
        const lastDotIndex = fileName.lastIndexOf(".");
        if (lastDotIndex <= 0 || lastDotIndex === fileName.length - 1) {
            return fileName.length > maxBaseLength ? `${fileName.slice(0, maxBaseLength)}...` : fileName;
        }
        const baseName = fileName.slice(0, lastDotIndex);
        const extension = fileName.slice(lastDotIndex);
        if (baseName.length <= maxBaseLength) return fileName;
        return `${baseName.slice(0, maxBaseLength)}...${extension}`;
    };

    const cards = {
        happening: {
            title: "What's Happening?",
            collapsedCta: selectedService ?? "Add Information",
            description:
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
        },
        where: {
            title: "Where's This?",
            collapsedCta: "Search Locations",
            description:
                "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.",
        },
    } as const;

    useEffect(() => {
        let cancelled = false;

        const loadServices = async () => {
            setIsLoadingServices(true);
            const { data } = await supabase
                .from("services")
                .select("label, order")
                .eq("active", true)
                .order("order", { ascending: true });

            const labels = Array.isArray(data)
                ? data
                      .map((row) => String((row as { label?: unknown }).label ?? "").trim())
                      .filter((label) => label.length > 0)
                : [];

            if (!cancelled) {
                setServices(labels);
                setIsLoadingServices(false);
            }
        };

        void loadServices();

        return () => {
            cancelled = true;
        };
    }, [supabase]);

    useEffect(() => {
        return () => {
            if (photoPreviewUrl) {
                URL.revokeObjectURL(photoPreviewUrl);
            }
        };
    }, [photoPreviewUrl]);

    useEffect(() => {
        const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
        if (!apiKey || typeof window === "undefined") return;

        let cancelled = false;
        let autocompleteListener: { remove: () => void } | null = null;

        const setupGoogleAddressFormatting = async () => {
            try {
                ensureGoogleMapsLoaderOptions(apiKey);
                await importLibrary("places");
                if (cancelled || !(window as any).google?.maps) return;

                geocoderRef.current = new (window as any).google.maps.Geocoder();

                if (locationInputRef.current) {
                    const autocomplete = new (window as any).google.maps.places.Autocomplete(
                        locationInputRef.current,
                        {
                            fields: ["formatted_address", "name"],
                            componentRestrictions: { country: "za" },
                        }
                    );
                    autocompleteListener = autocomplete.addListener("place_changed", () => {
                        const place = autocomplete.getPlace();
                        const formatted = place?.formatted_address || place?.name || "";
                        if (formatted) setLocationValue(formatted);
                    });
                }
            } catch {
                // Fail silently and keep manual input available.
            }
        };

        void setupGoogleAddressFormatting();

        return () => {
            cancelled = true;
            autocompleteListener?.remove();
        };
    }, []);

    const geocodeAddress = async (address: string): Promise<string> => {
        const geocoder = geocoderRef.current;
        if (!geocoder || !(window as any).google?.maps) return address;

        return new Promise((resolve) => {
            geocoder.geocode({ address, region: "za" }, (results: any, status: string) => {
                if (status === "OK" && results?.[0]?.formatted_address) {
                    resolve(results[0].formatted_address);
                    return;
                }
                resolve(address);
            });
        });
    };

    const reverseGeocode = async (latitude: number, longitude: number): Promise<string> => {
        const geocoder = geocoderRef.current;
        if (!geocoder || !(window as any).google?.maps) {
            return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
        }

        return new Promise((resolve) => {
            geocoder.geocode(
                { location: { lat: latitude, lng: longitude } },
                (results: any, status: string) => {
                    if (status === "OK" && results?.[0]?.formatted_address) {
                        resolve(results[0].formatted_address);
                        return;
                    }
                    resolve(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
                }
            );
        });
    };

    const handleGetCurrentLocation = () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            setLocationValue("Location Not Supported");
            return;
        }

        setIsGettingLocation(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                const formattedAddress = await reverseGeocode(latitude, longitude);
                setLocationValue(formattedAddress);
                setIsGettingLocation(false);
            },
            () => {
                setLocationValue("Cannot Retrieve Location");
                setIsGettingLocation(false);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    };

    const handleDestinationSelect = async (destination: (typeof suggestedDestinations)[number]) => {
        if (destination.useCurrentLocation) {
            handleGetCurrentLocation();
            return;
        }
        const formattedAddress = await geocodeAddress(destination.value);
        setLocationValue(formattedAddress);
    };

    const handleStartDiagnosis = async () => {
        if (!photoFile || !locationValue.trim()) return;

        setIsStartingDiagnosis(true);
        try {
            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(photoFile);
            });

            const finalDataUrl = await compressImage(dataUrl);
            const conversationId = createClientId();
            setImageData(conversationId, finalDataUrl, photoFile.name);

            try {
                sessionStorage.setItem(
                    `pending_diagnosis_image_url:${conversationId}`,
                    finalDataUrl
                );
                const trimmedInfo = welcomeInfoText.trim();
                if (trimmedInfo) {
                    sessionStorage.setItem(
                        `pending_diagnosis_prompt:${conversationId}`,
                        trimmedInfo
                    );
                }
                const trade = (selectedService ?? "").trim();
                if (trade) {
                    sessionStorage.setItem(
                        `pending_diagnosis_trade:${conversationId}`,
                        trade
                    );
                }
            } catch {
                // ignore quota / private mode
            }

            const location = locationValue.trim();
            const trade = (selectedService ?? "").trim();

            // Save welcome context to Supabase early so diagnosis does not depend on URL params.
            await patchConversation(conversationId, {
                image_url: finalDataUrl,
                initial_image_description: welcomeInfoText.trim() || null,
                customer_address: location || null,
                diagnosis: trade ? { selected_trade_hint: trade } : null,
            });

            router.push(`/diagnosis/${encodeURIComponent(conversationId)}`);
        } finally {
            setIsStartingDiagnosis(false);
        }
    };

    return (
        <ScanFlowShell
            contentBottomPadding={72}
            contentWrapperClassName="p-0 py-18"
            contentClassName="px-4"
            headerRight={
                <Button
                    variant="outline"
                    className="size-10"
                    onClick={() => router.back()}
                    aria-label="Close"
                >
                    <X size={24} weight="bold" className="text-foreground" />
                </Button>
            }
            footer={
                <div className="flex">
                    <Button
                        type="button"
                        className="h-10 w-full"
                        disabled={
                            !photoFile || !locationValue.trim() || isStartingDiagnosis
                        }
                        onClick={() => void handleStartDiagnosis()}
                    >
                        {isStartingDiagnosis ? "Starting…" : "Start Diagnosis"}
                    </Button>
                </div>
            }
        >
                {(["happening", "where"] as const).map((cardKey) => {
                    const card = cards[cardKey];
                    const isExpanded = expandedCard === cardKey;

                    if (isExpanded) {
                        return (
                            <div
                                key={cardKey}
                                className="flex flex-col p-6 gap-6 bg-background border border-border rounded-lg text-left"
                            >
                                <div className="flex flex-col gap-1">
                                    <p className="text-2xl text-foreground font-semibold tracking-tight">
                                        {card.title}
                                    </p>
                                    <p className="text-sm text-muted-foreground">{card.description}</p>
                                </div>
                                {cardKey === "happening" ? (
                                    <>
                                        <div className="flex flex-col gap-3">
                                            <Label>Service Type</Label>
                                            <Select
                                                value={selectedService ?? ""}
                                                onValueChange={(value) => setSelectedService(value)}
                                                disabled={isLoadingServices || services.length === 0}
                                            >
                                                <SelectTrigger className="w-full min-h-10">
                                                    <SelectValue
                                                        placeholder={
                                                            isLoadingServices
                                                                ? "Loading Services..."
                                                                : "Select Service"
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {services.map((service) => (
                                                        <SelectItem key={service} value={service}>
                                                            {service}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <p className="text-xs text-muted-foreground">
                                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                                            </p>
                                            {!isLoadingServices && services.length === 0 ? (
                                                <p className="text-xs text-muted-foreground">
                                                    No Services Available
                                                </p>
                                            ) : null}
                                        </div>
                                        <input
                                            ref={photoInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={(event) => {
                                                const file = event.target.files?.[0];
                                                if (!file) return;
                                                if (photoPreviewUrl) {
                                                    URL.revokeObjectURL(photoPreviewUrl);
                                                }
                                                const nextUrl = URL.createObjectURL(file);
                                                setPhotoPreviewUrl(nextUrl);
                                                setPhotoFileName(file.name);
                                                setPhotoFile(file);
                                            }}
                                        />
                                        {!photoPreviewUrl ? (
                                            <div className="flex flex-col px-4 py-6 items-center justify-center rounded-lg border border-dashed border-border">
                                                <p
                                                    className="text-sm text-foreground font-medium"
                                                >
                                                    Header Name
                                                </p>
                                                <p
                                                    className="text-xs text-muted-foreground mt-1"
                                                >
                                                    Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                                                </p>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-fit self-center mt-4"
                                                    onClick={() => photoInputRef.current?.click()}
                                                >
                                                    Browse Photos
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={photoPreviewUrl}
                                                        alt="Selected Photo"
                                                        className="min-w-24 min-h-24 max-w-24 max-h-24 object-cover rounded-lg border border-border"
                                                    />
                                                    <p className="text-sm text-foreground px-4">
                                                        {photoFileName
                                                            ? truncateFileNameKeepExtension(photoFileName)
                                                            : "Selected Photo"}
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (photoPreviewUrl) {
                                                            URL.revokeObjectURL(photoPreviewUrl);
                                                        }
                                                        setPhotoPreviewUrl(null);
                                                        setPhotoFileName(null);
                                                        setPhotoFile(null);
                                                        if (photoInputRef.current) {
                                                            photoInputRef.current.value = "";
                                                        }
                                                    }}
                                                >
                                                    Remove
                                                </Button>
                                            </div>
                                        )}
                                        <div className="flex flex-col gap-3">
                                            <Label>Add More Information</Label>
                                            <Textarea
                                                className="min-h-18"
                                                value={welcomeInfoText}
                                                onChange={(e) => setWelcomeInfoText(e.target.value)}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                                            </p>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="flex flex-col gap-3">
                                            <Label>Search Locations</Label>
                                            <Input
                                                ref={locationInputRef}
                                                className="w-full h-10"
                                                placeholder="e.g. 123 Scandio Lane, Cape Town"
                                                value={locationValue}
                                                onChange={(event) => setLocationValue(event.target.value)}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore.
                                            </p>
                                        </div>

                                        <div className="flex flex-col gap-3">
                                            {suggestedDestinations.map((destination) => (
                                                <div
                                                    key={destination.id}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => {
                                                        void handleDestinationSelect(destination);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key !== "Enter" && event.key !== " ") return;
                                                        event.preventDefault();
                                                        void handleDestinationSelect(destination);
                                                    }}
                                                    className="flex items-center justify-between"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-secondary">
                                                            <MapPin size={16} className="text-muted-foreground" />
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <p className="text-sm font-medium text-foreground">
                                                                {destination.title}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    }

                    return (
                        <button
                            key={cardKey}
                            type="button"
                            onClick={() => setExpandedCard(cardKey)}
                            className="flex flex-row justify-between items-center px-6 py-3.5 bg-background border border-border rounded-lg text-left"
                        >
                            <p className="text-sm text-muted-foreground">{card.title}</p>
                            <p className="text-sm text-foreground font-medium">{card.collapsedCta}</p>
                        </button>
                    );
                })}
        </ScanFlowShell>
    );
}
