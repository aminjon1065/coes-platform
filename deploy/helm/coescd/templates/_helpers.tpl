{{/*
=============================================================================
CoESCD Platform — Helm Template Helpers
=============================================================================
*/}}

{{/*
Expand the name of the chart.
*/}}
{{- define "coescd.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "coescd.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- .Chart.Name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{/*
Chart label (name + version).
*/}}
{{- define "coescd.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels applied to every resource.
*/}}
{{- define "coescd.labels" -}}
helm.sh/chart: {{ include "coescd.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
coescd.gov.tj/platform: "true"
coescd.gov.tj/environment: {{ .Values.global.environment | quote }}
{{- end }}

{{/*
Selector labels for a named component.
Usage: {{ include "coescd.selectorLabels" (dict "component" "backend" "root" .) }}
*/}}
{{- define "coescd.selectorLabels" -}}
app.kubernetes.io/name: {{ include "coescd.fullname" .root }}-{{ .component }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
Image pull secrets block (renders imagePullSecrets entry if secret name is set).
*/}}
{{- define "coescd.imagePullSecrets" -}}
{{- if .Values.global.imagePullSecret }}
imagePullSecrets:
  - name: {{ .Values.global.imagePullSecret }}
{{- end }}
{{- end }}

{{/*
Global node selector merged with per-component node selector.
Usage: {{ include "coescd.nodeSelector" (dict "component" .Values.backend "root" .) }}
*/}}
{{- define "coescd.nodeSelector" -}}
{{- $merged := merge (default dict .component.nodeSelector) (default dict .root.Values.global.nodeSelector) -}}
{{- if $merged }}
nodeSelector:
{{ toYaml $merged | indent 2 }}
{{- end }}
{{- end }}

{{/*
Global tolerations (renders tolerations block when configured).
*/}}
{{- define "coescd.tolerations" -}}
{{- if .Values.global.tolerations }}
tolerations:
{{ toYaml .Values.global.tolerations | indent 2 }}
{{- end }}
{{- end }}

{{/*
Standard image reference — respects global registry prefix.
Usage: {{ include "coescd.image" (dict "repository" "coescd/backend" "tag" "1.0.0" "root" .) }}
*/}}
{{- define "coescd.image" -}}
{{- $registry := .root.Values.global.imageRegistry -}}
{{- if $registry -}}
{{ $registry }}/{{ .repository }}:{{ default .root.Chart.AppVersion .tag }}
{{- else -}}
{{ .repository }}:{{ default .root.Chart.AppVersion .tag }}
{{- end -}}
{{- end }}

{{/*
StorageClass name — uses global.storageClass.
*/}}
{{- define "coescd.storageClass" -}}
{{- .Values.global.storageClass | default "standard" }}
{{- end }}
