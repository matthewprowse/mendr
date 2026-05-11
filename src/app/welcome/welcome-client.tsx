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
import { Images } from "@phosphor-icons/react";
import { ScanFlowShell } from "@/components/scan-flow-shell";
import { patchConversation } from "@/lib/diagnoses-api";
import { bootstrapDiagnosisFromServiceHint } from "@/lib/diagnosis-persist-shape";
import { X } from "@phosphor-icons/react";
import { toast } from "sonner";

const WESTERN_CAPE_LOCATION_ERROR =
    "Please use a location in the Western Cape, South Africa.";

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
            title: "Use Current Location",
            subtitle: "",
            value: "",
            useCurrentLocation: true,
        },
        {
            id: "stellenbosch",
            title: "Stellenbosch",
            subtitle: "",
            value: "Stellenbosch, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "paarl",
            title: "Paarl",
            subtitle: "",
            value: "Paarl, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "franschhoek",
            title: "Franschhoek",
            subtitle: "",
            value: "Franschhoek, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "hermanus",
            title: "Hermanus",
            subtitle: "",
            value: "Hermanus, Western Cape",
            useCurrentLocation: false,
        },
        {
            id: "george",
            title: "George",
            subtitle: "",
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
                "Take a photo of the fault and select the service type. Add a short description if the photo alone doesn't tell the full story.",
        },
        where: {
            title: "Where's This?",
            collapsedCta: "Search Locations",
            description:
                "Your location is used to find nearby providers. We only show providers in the Western Cape.",
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

    const geocodeInWesternCape = async (
        payload: { address?: string; lat?: number; lng?: number }
    ): Promise<{ address: string | null; error: string | null }> => {
        try {
            const res = await fetch("/api/geocode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...payload, westernCapeOnly: true }),
            });
            const data = (await res.json().catch(() => null)) as
                | { address?: string; error?: string }
                | null;
            if (!res.ok) {
                return {
                    address: null,
                    error: data?.error || WESTERN_CAPE_LOCATION_ERROR,
                };
            }
            return {
                address:
                    typeof data?.address === "string" && data.address.trim()
                        ? data.address.trim()
                        : null,
                error: null,
            };
        } catch {
            return { address: null, error: "Could not validate this location. Please try again." };
        }
    };

    const geocodeAddress = async (address: string): Promise<string | null> => {
        const result = await geocodeInWesternCape({ address: address.trim() });
        return result.address;
    };

    const reverseGeocode = async (
        latitude: number,
        longitude: number
    ): Promise<string | null> => {
        const result = await geocodeInWesternCape({ lat: latitude, lng: longitude });
        return result.address;
    };

    const getCurrentPositionAsync = (
        options: PositionOptions
    ): Promise<GeolocationPosition> => {
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    };

    const handleGetCurrentLocation = async () => {
        if (typeof navigator === "undefined" || !navigator.geolocation) {
            toast.error("Location is not supported on this device.");
            return;
        }

        setIsGettingLocation(true);
        try {
            // On some mobile devices high-accuracy GPS can timeout or fail.
            // Retry once with a lower-accuracy, cached-friendly request.
            let position: GeolocationPosition;
            try {
                position = await getCurrentPositionAsync({
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 60000,
                });
            } catch {
                position = await getCurrentPositionAsync({
                    enableHighAccuracy: false,
                    timeout: 20000,
                    maximumAge: 300000,
                });
            }

            const { latitude, longitude } = position.coords;
            const formattedAddress = await reverseGeocode(latitude, longitude);
            if (!formattedAddress) {
                setLocationValue("");
                toast.error(WESTERN_CAPE_LOCATION_ERROR);
                return;
            }
            setLocationValue(formattedAddress);
        } catch (error) {
            setLocationValue("");
            const code =
                typeof error === "object" &&
                error !== null &&
                "code" in error &&
                typeof (error as { code?: unknown }).code === "number"
                    ? (error as { code: number }).code
                    : null;

            if (code === 1) {
                toast.error("We cannot access your location. You must allow location access in your browser settings.");
            } else if (code === 3) {
                toast.error("Location request timed out. Move to better signal and try again.");
            } else {
                toast.error("Could not retrieve your current location. Please try again.");
            }
        } finally {
            setIsGettingLocation(false);
        }
    };

    const handleDestinationSelect = async (destination: (typeof suggestedDestinations)[number]) => {
        if (destination.useCurrentLocation) {
            await handleGetCurrentLocation();
            return;
        }
        const formattedAddress = await geocodeAddress(destination.value);
        if (!formattedAddress) {
            toast.error(WESTERN_CAPE_LOCATION_ERROR);
            return;
        }
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
            const validatedLocation = await geocodeAddress(location);
            if (!validatedLocation) {
                toast.error(WESTERN_CAPE_LOCATION_ERROR);
                return;
            }
            setLocationValue(validatedLocation);
            const trade = (selectedService ?? "").trim();

            // Save welcome context to Supabase early so diagnosis does not depend on URL params.
            await patchConversation(conversationId, {
                image_url: finalDataUrl,
                initial_image_description: welcomeInfoText.trim() || null,
                customer_address: validatedLocation || null,
                diagnosis: trade ? bootstrapDiagnosisFromServiceHint(trade) : null,
            });

            const qp = new URLSearchParams();
            if (trade) qp.set('trade', trade);
            if (validatedLocation) qp.set('location', validatedLocation);
            const suffix = qp.toString() ? `?${qp.toString()}` : '';
            router.push(`/processing/${encodeURIComponent(conversationId)}${suffix}`);
        } finally {
            setIsStartingDiagnosis(false);
        }
    };

    return (
        <div>
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
                                                Not sure which category fits? Select the closest one, and we will confirm during diagnosis.
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
                                            <div className="flex flex-col gap-3">
                                                <Button
                                                    variant="secondary"
                                                    className="h-10 w-full"
                                                    onClick={() => photoInputRef.current?.click()}
                                                >
                                                    Choose Photo
                                                </Button>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Take a clear photo showing the fault. The better the photo, the more accurate the diagnosis.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="flex min-w-0 items-center">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={photoPreviewUrl}
                                                        alt="Selected Photo"
                                                        className="min-w-24 min-h-24 max-w-24 max-h-24 object-cover rounded-lg border border-border"
                                                    />
                                                    <p className="min-w-0 truncate px-4 text-sm text-foreground">
                                                        {photoFileName
                                                            ? truncateFileNameKeepExtension(photoFileName)
                                                            : "Selected Photo"}
                                                    </p>
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="secondary"
                                                    size="sm"
                                                    className="w-full sm:w-auto"
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
                                                placeholder="Describe what you see. When did it start? Has it gotten worse?"
                                                value={welcomeInfoText}
                                                onChange={(e) => setWelcomeInfoText(e.target.value)}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                Optional, but more context improves diagnosis accuracy.
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
                                                Start typing your street address, suburb, or town. Provider results are within 25km of this location.
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
                            className="flex w-full items-center justify-between gap-3 px-6 py-3.5 bg-background border border-border rounded-lg text-left"
                        >
                            <p className="min-w-0 text-sm text-muted-foreground">{card.title}</p>
                            <p className="min-w-0 truncate text-right text-sm text-foreground font-medium">
                                {card.collapsedCta}
                            </p>
                        </button>
                    );
                })}
        </ScanFlowShell>
        </div>
    );
}
