# OmniWeave Terraform Infrastructure

This directory contains Terraform (IaC) configuration that provisions **all Google Cloud resources** required to run OmniWeave.

## Resources Provisioned

| Resource | Type | Purpose |
|----------|------|---------|
| `google_artifact_registry_repository.omniweave` | Artifact Registry | Docker image storage |
| `google_cloud_run_v2_service.omniweave_adk` | Cloud Run | ADK agent server (8 Gemini models) |
| `google_cloud_run_v2_service_iam_member.public_access` | IAM | Allow unauthenticated access |
| `google_service_account.cloud_run_sa` | IAM | Cloud Run service identity |
| `google_project_iam_member.vertex_ai_user` | IAM | Vertex AI access for Cloud Run |
| `google_project_iam_member.firestore_user` | IAM | Firestore access for Cloud Run |
| `google_firestore_database.default` | Firestore | Story persistence |
| `google_cloudbuild_trigger.omniweave_deploy` | Cloud Build | CI/CD on push to main |
| `google_project_service.*` | APIs | Enable all required GCP APIs |

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/downloads) >= 1.5
- [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) authenticated (`gcloud auth application-default login`)
- A GCP project with billing enabled
- A Google AI Studio API key ([get one](https://aistudio.google.com/))

## Usage

```bash
# 1. Authenticate
gcloud auth application-default login

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your values

# 3. Initialize Terraform
terraform init

# 4. Preview changes
terraform plan

# 5. Apply infrastructure
terraform apply

# 6. After apply, build and push the Docker image
cd ../server
gcloud builds submit --tag $(terraform -chdir=../terraform output -raw artifact_registry_repo)/omniweave-adk:latest .

# 7. Deploy frontend
cd ..
VITE_ADK_SERVER_URL=$(cd terraform && terraform output -raw cloud_run_url) npm run build
firebase deploy --only hosting --project YOUR_PROJECT_ID
```

## Alternative: One-Command Deployment

The `deploy-all.sh` in the root directory handles everything (Docker build → Artifact Registry → Cloud Run → Firebase Hosting) without needing Terraform:

```bash
export GCP_PROJECT_ID="your-project-id"
export GOOGLE_API_KEY="your-api-key"
chmod +x ../deploy-all.sh
../deploy-all.sh
```

## CI/CD via Cloud Build

The `cloudbuild.yaml` in the root defines a 6-step CI/CD pipeline triggered on every push to `main`. The Terraform `google_cloudbuild_trigger` resource connects this pipeline to the GitHub repository automatically.

Pipeline steps:
1. Build ADK server Docker image
2. Push to Artifact Registry
3. Deploy to Cloud Run
4. Install frontend dependencies
5. Build frontend
6. Deploy to Firebase Hosting

## Destroying Infrastructure

```bash
terraform destroy
```

> **Note**: Firebase Hosting and Firebase Authentication are managed via the Firebase console and CLI (`firebase deploy`), not via this Terraform config, as they require the Firebase Management API which has limited Terraform support.
