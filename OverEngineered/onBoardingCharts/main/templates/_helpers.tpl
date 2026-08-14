{{/*
Common labels for main platform chart
*/}}
{{- define "mlops-main.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- with .Values.commonLabels }}
{{- toYaml . | nindent 0 }}
{{- end }}
{{- end }}

{{- define "mlops-main.namespaceLabels" -}}
{{- include "mlops-main.labels" . }}
mlops.platform/environment: {{ .Values.platform.environment | quote }}
{{- end }}
