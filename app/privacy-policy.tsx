import { LegalDocView } from '@/components/LegalDocView';
import { privacyPolicyText } from '@/constants/privacyPolicy';

export default function PrivacyPolicyScreen() {
  return <LegalDocView title="Privacy Policy" body={privacyPolicyText} />;
}
