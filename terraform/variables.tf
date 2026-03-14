/**
 * OmniWeave Terraform Variables
 */

variable "project_id" {
  description = "Google Cloud project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud region for Cloud Run and Artifact Registry"
  type        = string
  default     = "us-central1"
}

variable "firestore_location" {
  description = "Cloud Firestore multi-region location"
  type        = string
  default     = "nam5"  # US multi-region
}

variable "google_api_key" {
  description = "Google AI Studio API key (required for Lyria RealTime and Live API)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_owner" {
  description = "GitHub repository owner (for Cloud Build trigger)"
  type        = string
  default     = "musicksto"
}

variable "github_repo" {
  description = "GitHub repository name (for Cloud Build trigger)"
  type        = string
  default     = "Omni_weave"
}
