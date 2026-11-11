import { PRIVACY_POLICY } from '../../lib/legalContent';
import { LegalDocumentScreen } from '../../ui/components/LegalDocumentScreen';

export default function PrivacyScreen() {
  return (
    <LegalDocumentScreen
      title="Privacy Policy"
      intro="How WaterMarket collects, uses, and protects your information."
      icon="shield-checkmark"
      sections={PRIVACY_POLICY}
    />
  );
}
