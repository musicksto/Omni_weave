/**
 * OmniWeave — Terraform Infrastructure as Code
 *
 * Provisions all Google Cloud resources required to run OmniWeave:
 *   - Artifact Registry (Docker image storage)
 *   - Cloud Run (ADK agent server)
 *   - Firebase Hosting (frontend SPA)
 *   - Cloud Firestore (story persistence)
 *   - Firebase Authentication (anonymous auth)
 *
 * Usage:
 *   cd terraform
 *   terraform init
 *   terraform plan -var="project_id=your-project-id" -var="google_api_key=your-key"
 *   terraform apply -var="project_id=your-project-id" -var="google_api_key=your-key"
 */

terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

# ─── Provider ─────────────────────────────────────────────────────────────────

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# ─── Enable Required APIs ──────────────────────────────────────────────────────

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  service            = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "aiplatform" {
  service            = "aiplatform.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firestore" {
  service            = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "firebase" {
  service            = "firebase.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "generativelanguage" {
  service            = "generativelanguage.googleapis.com"
  disable_on_destroy = false
}

# ─── Artifact Registry ────────────────────────────────────────────────────────

resource "google_artifact_registry_repository" "omniweave" {
  repository_id = "omniweave"
  format        = "DOCKER"
  location      = var.region
  description   = "OmniWeave container images"

  depends_on = [google_project_service.artifactregistry]
}

# ─── Cloud Run Service (ADK Agent Server) ─────────────────────────────────────

resource "google_cloud_run_v2_service" "omniweave_adk" {
  name     = "omniweave-adk"
  location = var.region

  template {
    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/omniweave/omniweave-adk:latest"

      resources {
        limits = {
          memory = "1Gi"
          cpu    = "1000m"
        }
        cpu_idle = true
      }

      ports {
        container_port = 8080
      }

      # Vertex AI mode — uses Application Default Credentials on Cloud Run
      env {
        name  = "GOOGLE_GENAI_USE_VERTEXAI"
        value = "TRUE"
      }
      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = "global"
      }

      # Google AI Studio API key — required for Lyria RealTime + Live API
      dynamic "env" {
        for_each = var.google_api_key != "" ? [1] : []
        content {
          name  = "GOOGLE_API_KEY"
          value = var.google_api_key
        }
      }
      dynamic "env" {
        for_each = var.google_api_key != "" ? [1] : []
        content {
          name  = "GEMINI_API_KEY"
          value = var.google_api_key
        }
      }
    }

    service_account = google_service_account.cloud_run_sa.email
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.run,
    google_artifact_registry_repository.omniweave,
  ]
}

# Allow unauthenticated access to Cloud Run
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.omniweave_adk.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ─── Service Account for Cloud Run ────────────────────────────────────────────

resource "google_service_account" "cloud_run_sa" {
  account_id   = "omniweave-run-sa"
  display_name = "OmniWeave Cloud Run Service Account"
}

# Grant Vertex AI access to the service account
resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Grant Firestore access
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# ─── Cloud Firestore ──────────────────────────────────────────────────────────

resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = var.firestore_location
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_project_service.firestore]
}

# ─── Cloud Build Trigger (CI/CD) ──────────────────────────────────────────────

resource "google_cloudbuild_trigger" "omniweave_deploy" {
  name        = "omniweave-deploy"
  description = "Build and deploy OmniWeave on push to main"

  github {
    owner = var.github_owner
    name  = var.github_repo

    push {
      branch = "^main$"
    }
  }

  filename = "cloudbuild.yaml"

  substitutions = {
    _REGION       = var.region
    _SERVICE_NAME = "omniweave-adk"
  }

  depends_on = [google_project_service.cloudbuild]
}
