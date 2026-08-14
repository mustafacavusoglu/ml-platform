{{- define "mlflow.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "mlflow.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "mlflow.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end }}

{{- define "mlflow.labels" -}}
app.kubernetes.io/name: {{ include "mlflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: mlops-platform
{{- end }}

{{- define "mlflow.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "mlflow.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end }}
