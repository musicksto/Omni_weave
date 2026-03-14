/**
 * OmniWeave Terraform Outputs
 */

output "cloud_run_url" {
  description = "Cloud Run service URL (ADK agent server)"
  value       = google_cloud_run_v2_service.omniweave_adk.uri
}

output "artifact_registry_repo" {
  description = "Artifact Registry repository URI"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/omniweave"
}

output "service_account_email" {
  description = "Cloud Run service account email"
  value       = google_service_account.cloud_run_sa.email
}

output "firestore_database" {
  description = "Cloud Firestore database name"
  value       = google_firestore_database.default.name
}

output "deploy_instructions" {
  description = "Post-deploy instructions"
  value       = <<-EOT
    ✅ Infrastructure provisioned!

    Backend URL: ${google_cloud_run_v2_service.omniweave_adk.uri}

    Next steps:
    1. Build and push the Docker image:
       cd server
       docker build -t ${var.region}-docker.pkg.dev/${var.project_id}/omniweave/omniweave-adk:latest .
       docker push ${var.region}-docker.pkg.dev/${var.project_id}/omniweave/omniweave-adk:latest

    2. Build and deploy the frontend:
       VITE_ADK_SERVER_URL=${google_cloud_run_v2_service.omniweave_adk.uri} npm run build
       firebase deploy --only hosting --project ${var.project_id}

    Or run the all-in-one script:
       GCP_PROJECT_ID=${var.project_id} GOOGLE_API_KEY=<your-key> ./deploy-all.sh
  EOT
}
