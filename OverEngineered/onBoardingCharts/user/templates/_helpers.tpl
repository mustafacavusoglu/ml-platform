{{- define "mlops-user.name" -}}
{{- .Values.user.name | required "user.name is required" -}}
{{- end }}

{{- define "mlops-user.namespace" -}}
{{- if .Values.namespace.name -}}
{{- .Values.namespace.name -}}
{{- else -}}
{{- printf "mlops-%s" (include "mlops-user.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end }}

{{- define "mlops-user.serviceAccountName" -}}
{{- if .Values.serviceAccount.name -}}
{{- .Values.serviceAccount.name -}}
{{- else -}}
mlops-workload
{{- end -}}
{{- end }}

{{- define "mlops-user.labels" -}}
app.kubernetes.io/name: {{ .Chart.Name }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
mlops.platform/user: {{ include "mlops-user.name" . | quote }}
mlops.platform/team: {{ .Values.user.team | quote }}
mlops.platform/profile: {{ .Values.profile | quote }}
{{- with .Values.commonLabels }}
{{- toYaml . | nindent 0 }}
{{- end }}
{{- end }}
