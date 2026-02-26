/**
 * File: tables.sql
 * Description: Supabase schema for Scandio home services app.
 * Idempotent: safe to run multiple times.
 *
 * Terminology:
 * - diagnosis: estimated assessment of the issue (what's wrong)
 * - service: canonical category of professional needed (from services table)
 */

-- Drop obsolete tables
DROP TABLE IF EXISTS report_owner_tokens;
DROP TABLE IF EXISTS report_access;

-- =============================================================================
-- 1. Services (canonical list — add/remove via Supabase)
-- =============================================================================
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL UNIQUE,
    search_query TEXT NOT NULL,
    sort_order INT DEFAULT 0,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_services_active ON services(active) WHERE active = true;

-- Seed initial services (idempotent)
INSERT INTO services (label, search_query, sort_order) VALUES
    ('Electrical', 'Electrician', 1),
    ('Plumbing', 'Plumber', 2),
    ('Security & Access', 'Security Systems', 3),
    ('Building & Construction', 'Builder', 4),
    ('Carpentry & Woodwork', 'Carpenter', 5),
    ('Flooring & Tiling', 'Flooring Contractor', 6),
    ('General Handyman', 'Handyman', 7),
    ('Locksmith Services', 'Locksmith', 8),
    ('Painting', 'Painter', 9),
    ('Pool Maintenance', 'Pool Service', 10),
    ('Rubble & Waste Removal', 'Waste Removal', 11),
    ('Welding', 'Welder', 12)
ON CONFLICT (label) DO NOTHING;

-- =============================================================================
-- 2. Cached Providers (Google Places enrichment cache)
-- =============================================================================
CREATE TABLE IF NOT EXISTS cached_providers (
    place_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    address TEXT,
    rating DECIMAL(3,2),
    rating_count INT,
    phone TEXT,
    website TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    summary TEXT,
    services JSONB,
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 3. Conversations (homeowner diagnosis sessions)
-- =============================================================================
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT DEFAULT 'New Diagnosis',
    image_url TEXT,
    customer_lat DOUBLE PRECISION,
    customer_lng DOUBLE PRECISION,
    customer_address TEXT,
    diagnosis JSONB,
    diagnosis_confirmed BOOLEAN DEFAULT false,
    providers JSONB,
    device TEXT,
    user_agent TEXT,
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate old column names if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'user_lat') THEN
        ALTER TABLE conversations RENAME COLUMN user_lat TO customer_lat;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'user_lng') THEN
        ALTER TABLE conversations RENAME COLUMN user_lng TO customer_lng;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'user_address') THEN
        ALTER TABLE conversations RENAME COLUMN user_address TO customer_address;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'diagnosis_json') THEN
        ALTER TABLE conversations RENAME COLUMN diagnosis_json TO diagnosis;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'providers_json') THEN
        ALTER TABLE conversations RENAME COLUMN providers_json TO providers;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'device_type') THEN
        ALTER TABLE conversations RENAME COLUMN device_type TO device;
    END IF;
END $$;

-- Ensure new columns exist
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_lat DOUBLE PRECISION;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_lng DOUBLE PRECISION;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS customer_address TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS diagnosis JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS providers JSONB;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS device TEXT;

-- Drop removed columns
ALTER TABLE conversations DROP COLUMN IF EXISTS ip_hash;
ALTER TABLE conversations DROP COLUMN IF EXISTS locked;
ALTER TABLE conversations DROP COLUMN IF EXISTS locked_at;

-- =============================================================================
-- 4. Messages (chat turns)
-- =============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    attachments TEXT[],
    feedback TEXT CHECK (feedback IN ('up', 'down')),
    diagnosis_updated BOOLEAN DEFAULT false,
    diagnosis JSONB,
    providers JSONB,
    emerging_providers JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate old column names
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'has_updated_diagnosis') THEN
        ALTER TABLE messages RENAME COLUMN has_updated_diagnosis TO diagnosis_updated;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'diagnosis_json') THEN
        ALTER TABLE messages RENAME COLUMN diagnosis_json TO diagnosis;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'providers_json') THEN
        ALTER TABLE messages RENAME COLUMN providers_json TO providers;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'emerging_providers_json') THEN
        ALTER TABLE messages RENAME COLUMN emerging_providers_json TO emerging_providers;
    END IF;
END $$;

ALTER TABLE messages ADD COLUMN IF NOT EXISTS diagnosis_updated BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS diagnosis JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS providers JSONB;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS emerging_providers JSONB;

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

-- =============================================================================
-- 5. Diagnoses (one per diagnosis event, links to service)
-- =============================================================================
CREATE TABLE IF NOT EXISTS diagnoses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    diagnosis JSONB NOT NULL,
    service_id UUID REFERENCES services(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate diagnosis_json → diagnosis, drop old trade column
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagnoses' AND column_name = 'diagnosis_json') THEN
        ALTER TABLE diagnoses RENAME COLUMN diagnosis_json TO diagnosis;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'diagnoses' AND column_name = 'trade') THEN
        ALTER TABLE diagnoses DROP COLUMN trade;
    END IF;
END $$;

ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id);

CREATE INDEX IF NOT EXISTS idx_diagnoses_conversation ON diagnoses(conversation_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_message ON diagnoses(message_id);
CREATE INDEX IF NOT EXISTS idx_diagnoses_service ON diagnoses(service_id);

-- =============================================================================
-- 6. Scandio Reports (shareable job report)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scandio_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    diagnosis_id UUID NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
    title TEXT,
    share_token TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scandio_reports_conversation ON scandio_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_scandio_reports_diagnosis ON scandio_reports(diagnosis_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_scandio_reports_token ON scandio_reports(share_token) WHERE share_token IS NOT NULL;

-- =============================================================================
-- 7. Leads (contact click tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    provider_place_id TEXT,
    provider_name TEXT,
    contact_type TEXT NOT NULL CHECK (contact_type IN ('whatsapp', 'phone', 'email')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_conversation ON leads(conversation_id);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- =============================================================================
-- 8. Provider Signups (service providers joining the network)
-- =============================================================================
CREATE TABLE IF NOT EXISTS provider_signups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    maps_link TEXT,
    service_id UUID REFERENCES services(id),
    description TEXT,
    team_size TEXT,
    marketing_budget TEXT,
    lead_price TEXT,
    report_conversation_id UUID,
    marketing_consent BOOLEAN DEFAULT false,
    address TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrate old column names
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_signups' AND column_name = 'contact_number') THEN
        ALTER TABLE provider_signups RENAME COLUMN contact_number TO phone;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_signups' AND column_name = 'google_maps_link') THEN
        ALTER TABLE provider_signups RENAME COLUMN google_maps_link TO maps_link;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_signups' AND column_name = 'main_trade') THEN
        ALTER TABLE provider_signups DROP COLUMN main_trade;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_signups' AND column_name = 'descriptive_text') THEN
        ALTER TABLE provider_signups RENAME COLUMN descriptive_text TO description;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_signups' AND column_name = 'spend_per_month') THEN
        ALTER TABLE provider_signups RENAME COLUMN spend_per_month TO marketing_budget;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'provider_signups' AND column_name = 'price_per_lead') THEN
        ALTER TABLE provider_signups RENAME COLUMN price_per_lead TO lead_price;
    END IF;
END $$;

ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id);
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS maps_link TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS marketing_budget TEXT;
ALTER TABLE provider_signups ADD COLUMN IF NOT EXISTS lead_price TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_signups_created ON provider_signups(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_signups_service ON provider_signups(service_id);

-- =============================================================================
-- 9. Provider Reports (report a provider to Scandio)
-- =============================================================================
CREATE TABLE IF NOT EXISTS provider_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_place_id TEXT NOT NULL,
    provider_name TEXT NOT NULL,
    provider_address TEXT,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    reporter_email TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_provider_reports_created ON provider_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_provider_reports_place_id ON provider_reports(provider_place_id);

-- =============================================================================
-- 10. Feedback: Unrelated images (random/off-topic)
-- =============================================================================
CREATE TABLE IF NOT EXISTS feedback_unrelated (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    diagnosis_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_unrelated_conversation ON feedback_unrelated(conversation_id);
CREATE INDEX IF NOT EXISTS idx_feedback_unrelated_created ON feedback_unrelated(created_at);

-- =============================================================================
-- 11. Feedback: Unserviced categories (we don't offer this service yet — learn from demand)
-- =============================================================================
CREATE TABLE IF NOT EXISTS feedback_unserviced (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    requested_service TEXT NOT NULL,
    diagnosis TEXT,
    diagnosis_full JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_unserviced_conversation ON feedback_unserviced(conversation_id);
CREATE INDEX IF NOT EXISTS idx_feedback_unserviced_service ON feedback_unserviced(requested_service);
CREATE INDEX IF NOT EXISTS idx_feedback_unserviced_created ON feedback_unserviced(created_at);

-- =============================================================================
-- 12. Legal Documents (Privacy Policy, Terms of Service, Pro Terms)
-- =============================================================================
CREATE TABLE IF NOT EXISTS legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('privacy_policy', 'terms_of_service', 'pro_terms_of_service')),
    content TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT 'v1.0',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_type_active ON legal_documents(type, is_active) WHERE is_active = true;

-- Seed initial legal documents (idempotent — only if none exist for each type)
-- Update existing documents to latest content (run after INSERT for existing DBs)
DO $$
DECLARE
    priv_content TEXT;
    terms_content TEXT;
    pro_content TEXT;
BEGIN
    priv_content := $priv$
# Comprehensive Privacy Policy (POPIA Compliant)

**Last updated: February 2026 | Version 2.0**

## 1. Introduction

Scandio ("we," "us," or "our") is committed to protecting the privacy and personal information of our users in accordance with the **Protection of Personal Information Act, No. 4 of 2013 (POPIA)** of South Africa. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Platform.

## 2. Information We Collect

We collect information that identifies, relates to, or could reasonably be linked to an individual ("Personal Information").

* **User-Provided Data:** Name, WhatsApp phone number, physical address, and email address.
* **Visual Data:** Photos of household faults. These photos may contain metadata (Exif data) including the time and location the photo was taken.
* **Service Provider Data:** Business registration details, Google Business Profile data, and service radius.
* **Automated Data:** IP addresses, browser types, and device identifiers collected via Supabase and Vercel.

## 3. Purpose of Processing

We process your Personal Information for the following "Competent Business Purposes":

* **Diagnostic Generation:** To facilitate the AI analysis of your household fault.
* **Lead Routing:** To share your contact details and fault report with Service Providers within your geographic area.
* **Platform Improvement:** To train our proprietary AI models to better recognize South African infrastructure and common Western Cape household faults.
* **Communication:** To deliver the Scandio Report via WhatsApp or email.

## 4. Disclosure of Information

**We do not sell your Personal Information to third-party advertisers.** Your data is shared only in the following circumstances:

* **To Service Providers:** When you request a connection, your name, address, phone number, and fault report are shared with the matched Pros.
* **To Service Facilitators:** We share data with Google (via Gemini API for diagnosis) and Supabase (for secure database storage). These parties are contractually bound to protect your data.
* **Legal Requirements:** If required by South African law or in response to a valid subpoena.

## 5. Data Security

We implement a variety of technical and organizational security measures to maintain the safety of your Personal Information.

* **Encryption:** All data is encrypted in transit using SSL/TLS and at rest within our PostgreSQL database hosted on Supabase.
* **Access Control:** Access to raw user data is strictly limited to Scandio's core technical team.

## 6. Your Rights Under POPIA

Under POPIA, you have the right to:

1. **Access:** Request a copy of the Personal Information we hold about you.
2. **Correction:** Request that we update or correct inaccurate data.
3. **Deletion:** Request that we delete your account and all associated Scandio Reports.
4. **Objection:** Object to the processing of your data for AI training purposes.

## 7. Retention of Data

We retain your Personal Information for as long as your account is active or as needed to provide you with the Platform's services. Anonymized visual data (photos of faults without personal identifiers) may be retained indefinitely to support the long-term accuracy of our AI engine.

## 8. Contact Information

For any questions regarding this Privacy Policy or to exercise your rights, please contact our Information Officer at **legal@scandio.app**.
$priv$;

    terms_content := $terms$
# Comprehensive Terms of Service (Customers)

**Last updated: February 2026 | Version 2.0**

## 1. Introduction and Acceptance of Terms

Welcome to Scandio. These Terms of Service ("Terms") constitute a legally binding agreement made between you, whether personally or on behalf of an entity ("you" or "Customer") and Scandio ("we," "us," or "our"), concerning your access to and use of the Scandio website, mobile application, and the AI-driven diagnostic services provided (collectively, the "Platform").

By accessing the Platform, uploading images, or generating a Scandio Report, you acknowledge that you have read, understood, and agreed to be bound by all of these Terms. **If you do not agree with all of these Terms, then you are expressly prohibited from using the Platform and must discontinue use immediately.**

## 2. Nature of the Service: The AI "Estimated Diagnosis"

Scandio provides an automated, Artificial Intelligence-driven diagnostic interface.

* **Visual Analysis:** The Platform utilizes computer vision and machine learning (via Google Gemini API) to analyze user-submitted photographs of household faults.
* **Estimated Findings:** You expressly acknowledge that any "Diagnosis," "Estimated Cost," or "Severity Rating" provided by the Platform is a **mathematical estimation** based on visual data. It is not a definitive technical finding.
* **No Physical Inspection:** Scandio does not perform physical inspections. The Report is intended as a preliminary guide to assist you in selecting a Service Provider and is not a substitute for professional, on-site expertise.

## 3. Limitation of Liability and Disclaimer of Warranties

* **"As-Is" Basis:** The Platform and the Scandio Report are provided on an "as-is" and "as-available" basis. You agree that your use of the Platform and our services will be at your sole risk.
* **Professional Verification Required:** To the fullest extent permitted by law, Scandio disclaims all warranties, express or implied, in connection with the Platform. We make no warranties or representations about the accuracy or completeness of the AI-generated content. **You are strictly required to obtain a physical, on-site verification from a qualified Service Provider before authorizing any repairs, purchasing parts, or making financial commitments.**
* **Consequential Damages:** In no event will Scandio, its directors, employees, or agents be liable to you or any third party for any direct, indirect, consequential, exemplary, incidental, special, or punitive damages, including lost profit, lost revenue, or property damage arising from your use of the Platform or reliance on a Scandio Report.

## 4. Relationship with Service Providers

Scandio is a lead-generation and diagnostic platform; we are not a party to any contract between a Customer and a Service Provider.

* **Independence:** Service Providers (Plumbers, Electricians, etc.) are independent contractors and are not employees, agents, or partners of Scandio.
* **No Vetting Guarantee:** While Scandio requires Service Providers to link a Google Business Profile, we do not conduct criminal background checks, verify trade licenses (PIRB, ECA, etc.), or guarantee the quality of work.
* **Dispute Resolution:** Any disputes regarding workmanship, pricing, damage to property, or theft must be resolved directly between the Customer and the Service Provider. Scandio will not mediate, arbitrate, or accept liability for such disputes.

## 5. User-Generated Content and Photo Rights

By uploading photos to the Platform, you grant Scandio a non-exclusive, royalty-free, perpetual, and worldwide license to use, host, store, and reproduce such images for the purposes of generating your Report and training our AI models to improve diagnostic accuracy. You represent that you own the rights to the photos uploaded and that they do not infringe on the privacy of third parties.
$terms$;

    pro_content := $pro$
# Comprehensive Terms of Service (Service Providers)

**Last updated: February 2026 | Version 3.0**

## 1. Eligibility and Registration

To participate in the Scandio Network as a Service Provider ("Pro"), you must be a legally registered business or sole proprietor operating within the Western Cape, South Africa. You must provide accurate business information, a valid WhatsApp-enabled contact number, and a link to a verifiable Google Business Profile.

## 2. The Lead Delivery Model

Scandio provides you with "High-Intent Leads." A lead consists of a Customer's contact details, location, and the AI-generated Scandio Report.

* **Lead Quality:** While Scandio utilizes AI to filter and categorize leads into the **12 Service Categories**, we do not guarantee that every lead will result in a billable job.
* **Data Usage:** You are granted a limited, non-transferable license to use the Customer data provided in a lead solely for the purpose of quoting and performing the requested service. You may not sell, trade, or distribute this data to third-party marketing firms.

## 3. Fee Structure and the September 2026 Transition

* **Free Trial Period:** Access to the Platform is free for all verified Service Providers until **August 31, 2026**.
* **Mandatory Subscription:** Effective **September 1, 2026**, access to leads will be restricted to paying subscribers. You will be required to select a subscription tier (Solo, Small Team, or Enterprise) to remain visible on the Platform.
* **No Refunds:** Subscription fees are non-refundable and are billed monthly in advance.

## 4. Professional Conduct and Accuracy

* **Truth in Advertising:** You must not misrepresent your qualifications. If you are tagged in "Electrical," you must be legally qualified to perform electrical work in South Africa.
* **Independent Diagnosis:** You acknowledge that the Scandio Report is an aid for the Customer. You are professionally obligated to perform your own diagnosis upon arrival at the property. You must not rely solely on the AI's findings for safety-critical repairs.

## 5. Indemnification

You agree to defend, indemnify, and hold Scandio harmless (including our subsidiaries and affiliates) from and against any loss, damage, liability, or claim (including reasonable attorneys' fees) made by any third party (including Customers) due to or arising out of: (1) your performance of services; (2) breach of these Terms; or (3) your violation of the rights of a third party, including but not limited to property damage or personal injury.

## 6. Payment Processing (Scandio Pay)

* Service Providers acknowledge that payments processed through the Platform are subject to third-party gateway fees.
* **Payout Schedule:** Funds are held in escrow until the Customer marks the job as "Complete" in the Scandio app. Payouts are triggered 48 hours post-completion to handle dispute windows.

## 7. Invoicing & Tax

* Scandio is a platform for the *issuance* of invoices. Service Providers remain solely responsible for their own VAT registration and SARS compliance.
* Invoices generated by Scandio are based on data provided by the Pro; Scandio is not liable for errors in quoting or billing.

## 8. CRM & Data Ownership

* Data entered into the Scandio CRM remains the property of the Service Provider. However, Scandio reserves the right to use anonymized metadata (job types, average costs, suburb trends) to improve AI pricing estimates.
$pro$;

    -- Update existing rows (for databases that already have legal_documents)
    UPDATE legal_documents SET content = priv_content, version = 'v2.0' WHERE type = 'privacy_policy';
    UPDATE legal_documents SET content = terms_content, version = 'v2.0' WHERE type = 'terms_of_service';
    UPDATE legal_documents SET content = pro_content, version = 'v3.0' WHERE type = 'pro_terms_of_service';

    -- Insert only if no row exists for each type
    INSERT INTO legal_documents (type, content, version, is_active)
    SELECT 'privacy_policy', priv_content, 'v2.0', true
    WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE type = 'privacy_policy' LIMIT 1);

    INSERT INTO legal_documents (type, content, version, is_active)
    SELECT 'terms_of_service', terms_content, 'v2.0', true
    WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE type = 'terms_of_service' LIMIT 1);

    INSERT INTO legal_documents (type, content, version, is_active)
    SELECT 'pro_terms_of_service', pro_content, 'v3.0', true
    WHERE NOT EXISTS (SELECT 1 FROM legal_documents WHERE type = 'pro_terms_of_service' LIMIT 1);
END $$;
