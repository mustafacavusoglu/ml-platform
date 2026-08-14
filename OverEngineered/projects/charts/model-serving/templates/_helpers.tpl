{{- define "model-serving.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "model-serving.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "model-serving.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "model-serving.labels" -}}
app.kubernetes.io/name: {{ include "model-serving.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: mlops-platform
{{- end }}

{{- define "model-serving.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "model-serving.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
