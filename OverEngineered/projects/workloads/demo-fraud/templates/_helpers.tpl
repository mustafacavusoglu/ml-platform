{{- define "ml-project.name" -}}
{{- .Values.project.name | required "project.name is required" -}}
{{- end }}

{{- define "ml-project.namespace" -}}
{{- if .Values.namespace.name -}}
{{- .Values.namespace.name -}}
{{- else -}}
{{- printf "proj-%s" (include "ml-project.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{- define "ml-project.labels" -}}
app.kubernetes.io/name: {{ include "ml-project.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: mlops-platform
mlops.platform/project: {{ include "ml-project.name" . | quote }}
mlops.platform/team: {{ .Values.project.team | quote }}
mlops.platform/environment: {{ .Values.project.environment | quote }}
{{- end }}

{{- define "ml-project.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default "workload" .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
