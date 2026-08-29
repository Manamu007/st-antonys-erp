import React, { createContext, useContext, useEffect, useState } from 'react';
import { dbService } from '../services/dbService';
import { safeStorage as localStorage } from '../lib/safeStorage';

interface AcademicYearDetail {
  name: string; // YYYY-YY pattern
  startDate: string;
  endDate: string;
  status: 'active' | 'archived' | 'upcoming';
}

interface Settings {
  schoolName: string;
  logoUrl: string;
  theme?: 'default' | 'glass-dark';
  address?: string;
  contactEmail?: string;
  phone?: string;
  website?: string;
  principalName?: string;
  establishedYear?: string;
  affiliationNumber?: string;
  currentAcademicYear?: string;
  academicYears?: string[];
  academicYearDetails?: AcademicYearDetail[];
  aiAgentEnabled?: boolean;
  aiApiKey?: string;
  aiApiKeyEnabled?: boolean;
  aiBotInstructions?: string;
  aiSpending?: number;
  timezone?: string;
  teacherLeaveQuotaEnabled?: boolean;
  razorpayKeyId?: string;
  razorpayPaymentLink?: string;
  razorpayMerchantName?: string;
  razorpayMid?: string;
  razorpayTid?: string;
  receiptPageWidth?: number;
  receiptPageLength?: number;
  hmSignatureUrl?: string;
  hmName?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  awsS3BucketName?: string;
}

interface SiteConfig {
  hero: { title: string; subtitle: string; backgroundImage: string; ctaText?: string; exploreText?: string };
  about: { prefix: string; title: string; text: string; tagline?: string; gridPhotos: string[]; stats: { value: string; label: string }[] };
  leadership: { name: string; role: string; quote: string; photoUrl: string }[];
  methodology: { title: string; description: string; number: string }[];
  socialLinks: { facebook: string; twitter: string; instagram: string; youtube: string; linkedin?: string };
  cta?: { title: string; description: string; buttonText: string; contactText?: string };
  pillars?: { title: string; subtitle: string; buttonText: string };
  footerDescription?: string;
  footerEmail?: string;
  footerPhone?: string;
  slogan?: string;
  establishedText?: string;
  galleryVideos?: string[];
  mapsUrl?: string;
  address?: string;
  admissionStatus?: string;
}

interface SettingsContextType {
  settings: Settings;
  siteConfig: SiteConfig | null;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
  updateSiteConfig: (newConfig: any) => Promise<void>;
  loading: boolean;
}

const defaultSettings: Settings = {
  schoolName: "St. Antony's High School",
  logoUrl: "https://storage.googleapis.com/firebasestorage.googleapis.com/v0/b/antigravity-build-prod.appspot.com/o/attachments%2F98877142-303c-4395-926d-4959141f173c?alt=media&token=89437996-2487-4348-8446-281087429188",
  theme: 'default',
  contactEmail: "admin@antonyschool.in",
  phone: "8822269999",
  currentAcademicYear: '2026-27',
  academicYears: ['2023-24', '2024-25', '2025-26', '2026-27'],
  academicYearDetails: [
    { name: '2023-24', startDate: '2023-04-01', endDate: '2024-03-31', status: 'archived' },
    { name: '2024-25', startDate: '2024-04-01', endDate: '2025-03-31', status: 'archived' },
    { name: '2025-26', startDate: '2025-04-01', endDate: '2026-03-31', status: 'archived' },
    { name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', status: 'active' }
  ],
  aiAgentEnabled: true,
  timezone: 'Asia/Kolkata',
  teacherLeaveQuotaEnabled: true
};

const defaultSiteConfig: SiteConfig = {
  hero: {
    title: "Nurturing Visionary Minds",
    subtitle: "Discover the history, people, and methodology that make St. Antony's a beacon of global education.",
    backgroundImage: "https://images.unsplash.com/photo-1523050335391-4b7713d09a1f?auto=format&fit=crop&w=2000&q=80",
    ctaText: "Access Portal",
    exploreText: "Explore Legacy"
  },
  about: {
    prefix: "LEGACY OF EXCELLENCE",
    title: "A Journey Through Time",
    tagline: "ESTABLISHED 1954",
    text: "Founded in the heart of the community over seven decades ago, St. Antony's School began as a humble initiative by a group of visionary educators.",
    gridPhotos: [],
    stats: [
      { value: "70+", label: "YEARS OF LEGACY" },
      { value: "12k+", label: "ALUMNI NETWORK" },
      { value: "50+", label: "AWARDS WON" }
    ]
  },
  leadership: [],
  methodology: [
    { title: "Critical Inquiry", number: "01", description: "Encouraging students to question established norms and develop independent thinking patterns." },
    { title: "Collaborative Spirit", number: "02", description: "Project-based learning that emphasizes teamwork, empathy, and leadership skills." },
    { title: "Digital Literacy", number: "03", description: "Integrating cutting-edge technology into every subject to prepare students for a global future." }
  ],
  socialLinks: { facebook: "", twitter: "", instagram: "", youtube: "", linkedin: "" },
  cta: {
    title: "Ready to Shape Your Future?",
    description: "Applications for the next academic year are now open. Start your journey towards global excellence today.",
    buttonText: "Apply Now",
    contactText: "Contact Admissions"
  },
  slogan: "LEGACY OF EXCELLENCE",
  establishedText: "Excellence in education since 2000",
  footerDescription: "Empowering visionary minds through excellence in education, character building, and digital innovation. Join our community of lifelong learners.",
  footerEmail: "admin@antonyschool.in",
  footerPhone: "+91 91234 56789",
  mapsUrl: "",
  address: "",
  admissionStatus: "open"
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(defaultSiteConfig);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 5000);

    const fetchAllData = async () => {
      // If we know quota is hit, don't even try and just use defaults/persistent cache
      const isQuotaHit = typeof window !== 'undefined' && localStorage.getItem('firestore_quota_exceeded_timestamp');
      if (isQuotaHit) {
        setLoading(false);
        return;
      }

      try {
        // Fetch settings and siteConfig separately so one failure doesn't block the other
        const settingsData = await dbService.get('settings', 'school').catch(err => {
          console.error("Error fetching school settings:", err);
          return null;
        });
        
        if (settingsData) {
          setSettings(settingsData as Settings);
        }

        const configData = await dbService.get('siteConfig', 'home').catch(err => {
          console.error("Error fetching site config:", err);
          return null;
        });
        
        if (configData) {
          setSiteConfig(configData as SiteConfig);
        }
        
        clearTimeout(safetyTimeout);
      } catch (error) {
        console.error("Error fetching context data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
    return () => {
      clearTimeout(safetyTimeout);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme || 'default');
  }, [settings.theme]);

  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    await dbService.set('settings', 'school', updated);
    setSettings(updated);
  };

  const updateSiteConfig = async (newConfig: any) => {
    await dbService.set('siteConfig', 'home', newConfig);
    setSiteConfig(newConfig);
  };

  const value = React.useMemo(() => ({ 
    settings, 
    siteConfig, 
    updateSettings, 
    updateSiteConfig, 
    loading 
  }), [settings, siteConfig, loading]);

  return (
    <SettingsContext.Provider value={value}>
      <div className="glass-theme-bg" />
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
