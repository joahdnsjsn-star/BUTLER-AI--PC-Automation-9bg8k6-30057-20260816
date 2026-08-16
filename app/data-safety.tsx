import { LegalDocView } from '@/components/LegalDocView';
import { dataSafetyText } from '@/constants/dataSafety';

export default function DataSafetyScreen() {
  return <LegalDocView title="Data Safety" body={dataSafetyText} />;
}
