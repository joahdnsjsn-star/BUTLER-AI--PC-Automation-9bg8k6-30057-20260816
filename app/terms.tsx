import { LegalDocView } from '@/components/LegalDocView';
import { termsText } from '@/constants/terms';

export default function TermsScreen() {
  return <LegalDocView title="Terms of Service" body={termsText} />;
}
