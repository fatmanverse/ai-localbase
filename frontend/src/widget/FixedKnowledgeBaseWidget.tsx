import { ServiceDeskWidget, type ServiceDeskWidgetProps } from './ServiceDeskWidget'

export interface FixedKnowledgeBaseWidgetProps
  extends Omit<ServiceDeskWidgetProps, 'knowledgeBaseId'> {
  knowledgeBaseId: string
}

export function FixedKnowledgeBaseWidget({ knowledgeBaseId, ...props }: FixedKnowledgeBaseWidgetProps) {
  return <ServiceDeskWidget {...props} knowledgeBaseId={knowledgeBaseId} />
}
