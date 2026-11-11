import { TERMS_OF_SERVICE } from '../../lib/legalContent';
import { LegalDocumentScreen } from '../../ui/components/LegalDocumentScreen';

export default function TermsScreen() {
  return (
    <LegalDocumentScreen
      title="Terms & Conditions"
      intro="WaterMarket Water Refilling Station. Please read these terms before you order."
      icon="document-text"
      sections={TERMS_OF_SERVICE}
    />
  );
}
