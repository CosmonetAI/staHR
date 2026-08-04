export interface ExperienceRange {
  minimum: number | null
  maximum: number | null
}

export interface ParsedJobDescription {
  jobTitle?: string
  department?: string
  experience?: ExperienceRange
  employmentType?: string
  workMode?: string
  location?: string
  numberOfPositions?: number
  budget?: { minimum?: string; maximum?: string; currency?: string }
  noticePeriod?: string
  primarySkills?: string[]
  secondarySkills?: string[]
  responsibilities?: string[]
  qualifications?: string[]
  preferredSkills?: string[]
  tools?: string[]
  certifications?: string[]
  education?: string
  industry?: string
  summary?: string
  jobDescription?: string
}

export default ParsedJobDescription
